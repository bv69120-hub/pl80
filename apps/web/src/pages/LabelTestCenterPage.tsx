import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useAuth } from "../auth/useAuth";
import { apiUrl } from "../api/apiUrl";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const CARRIERS = [
  { value: "CHRONOPOST", label: "Chronopost" },
  { value: "COLISSIMO", label: "Colissimo" },
  { value: "MONDIAL_RELAY", label: "Mondial Relay" },
  { value: "VINTED", label: "Vinted / Vinted Go" },
  { value: "RELAIS_COLIS", label: "Relais Colis" },
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES_PER_ANALYSIS = 5;
const PHYSICAL_FIELDS = [
  ["formatCorrect", "Format 100 × 150 mm correct"],
  ["noEssentialContentCut", "Aucun élément indispensable coupé"],
  ["orientationCorrect", "Orientation correcte"],
  ["textReadable", "Texte lisible"],
  ["codeReadable", "Code-barres ou QR code lisible"],
] as const;

type PhysicalValidation = {
  formatCorrect: boolean;
  noEssentialContentCut: boolean;
  orientationCorrect: boolean;
  textReadable: boolean;
  codeReadable: boolean;
  scannedWhenAvailable: boolean | null;
};

interface AnalysisResult {
  id: string;
  modelName: string;
  createdAt: string;
  expiresAt: string;
  physicalPrintRequested: boolean;
  physicalValidation?: PhysicalValidation;
  selectedCategory: string;
  carrier: string;
  sourceFormat: string;
  sourceDimensions: {
    widthPoints: number;
    heightPoints: number;
    pageCount: number;
    orientation: string;
  };
  extractedRegion: { left: number; bottom: number; right: number; top: number };
  preparedDimensions: { widthPoints: number; heightPoints: number };
  strategy: string;
  adaptation: string;
  proportionsPreserved: boolean;
  checks: {
    validPdf: boolean;
    targetDimensions: boolean;
    proportionsPreserved: boolean;
    physicalPrint: string;
  };
  warnings: string[];
  previews: { original: string; extracted: string; prepared: string };
  previewUrls: { original: string; extracted: string; prepared: string };
  visualReviewed: boolean;
}

function bearerHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? "La demande n’a pas abouti.";
  } catch {
    return "La demande n’a pas abouti.";
  }
}

function resultStatus(result: AnalysisResult) {
  if (!result.checks.validPdf || !result.checks.targetDimensions) return "Non conforme";
  if (!result.visualReviewed || result.warnings.length > 0) return "À vérifier";
  if (result.checks.physicalPrint !== "PHYSICALLY_VALIDATED") return "Non testé";
  return "Conforme";
}

export function LabelTestCenterPage() {
  const { token, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>(CARRIERS[0].value);
  const [modelName, setModelName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<Record<string, Partial<PhysicalValidation>>>({});
  const [printBusyId, setPrintBusyId] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const activeResult = useMemo(
    () => results.find((result) => result.id === activeResultId) ?? null,
    [activeResultId, results],
  );

  useEffect(() => () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  if (user?.role !== "ADMIN") {
    return (
      <Alert severity="error">
        Le Centre de test des étiquettes est réservé aux administrateurs.
      </Alert>
    );
  }

  function selectFiles(selectedFiles: FileList | null) {
    setError(null);
    if (!selectedFiles?.length) return;
    const selected = Array.from(selectedFiles);
    if (selected.length > MAX_FILES_PER_ANALYSIS) {
      setError(`Sélectionnez au maximum ${MAX_FILES_PER_ANALYSIS} PDF par analyse.`);
      return;
    }
    const invalid = selected.find(
      (file) =>
        (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) ||
        file.size > MAX_FILE_SIZE,
    );
    if (invalid) {
      setError(
        invalid.size > MAX_FILE_SIZE
          ? `${invalid.name} dépasse la limite de 10 Mo.`
          : `${invalid.name} n’est pas un fichier PDF.`,
      );
      return;
    }
    setFiles(selected);
  }

  async function requestAnalysis(file: File) {
    if (!token) throw new Error("Votre session a expiré. Reconnectez-vous.");
    const body = new FormData();
    body.append("file", file);
    body.append("modelName", modelName.trim() || "Modèle sans nom");
    body.append("selectedCategory", category);
    const response = await fetch(apiUrl("/api/label-tests/analyze"), {
      method: "POST",
      headers: bearerHeaders(token),
      body,
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const data = (await response.json()) as Omit<AnalysisResult, "previewUrls" | "visualReviewed">;
    const previewUrls = {} as AnalysisResult["previewUrls"];
    try {
      for (const view of ["original", "extracted", "prepared"] as const) {
        const previewResponse = await fetch(apiUrl(data.previews[view]), {
          headers: bearerHeaders(token),
        });
        if (!previewResponse.ok) throw new Error(await readApiError(previewResponse));
        previewUrls[view] = URL.createObjectURL(await previewResponse.blob());
        previewUrlsRef.current.push(previewUrls[view]);
      }
    } catch (previewError) {
      for (const url of Object.values(previewUrls)) URL.revokeObjectURL(url);
      throw previewError;
    }
    return { ...data, previewUrls, visualReviewed: false } satisfies AnalysisResult;
  }

  async function analyze() {
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const added: AnalysisResult[] = [];
    try {
      for (const file of files) {
        const result = await requestAnalysis(file);
        added.push(result);
        setResults((current) => [...current, result]);
        setActiveResultId(result.id);
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      setNotice(
        `${added.length} analyse${added.length > 1 ? "s" : ""} terminée${added.length > 1 ? "s" : ""}.`,
      );
    } catch (analysisError) {
      console.error("Label test analysis failed.", analysisError);
      setError(
        analysisError instanceof Error ? analysisError.message : "Le PDF n’a pas pu être analysé.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestPhysicalPrint(result: AnalysisResult) {
    if (!token || result.physicalPrintRequested || printBusyId) return;
    const confirmed = window.confirm(
      "Confirmez-vous l’impression d’UNE SEULE copie de cette étiquette de test sur la PL80E ?",
    );
    if (!confirmed) return;
    setPrintBusyId(result.id);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/label-tests/${result.id}/print`), {
        method: "POST",
        headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setResults((current) =>
        current.map((entry) =>
          entry.id === result.id ? { ...entry, physicalPrintRequested: true } : entry,
        ),
      );
      setNotice("Une demande a été envoyée. Inspectez l’étiquette physique avant de valider.");
    } catch (printError) {
      setError(
        printError instanceof Error ? printError.message : "Échec de la demande d’impression.",
      );
    } finally {
      setPrintBusyId(null);
    }
  }

  async function savePhysicalValidation(result: AnalysisResult) {
    if (!token) return;
    const entered = validation[result.id] ?? {};
    const payload: PhysicalValidation = {
      formatCorrect: entered.formatCorrect === true,
      noEssentialContentCut: entered.noEssentialContentCut === true,
      orientationCorrect: entered.orientationCorrect === true,
      textReadable: entered.textReadable === true,
      codeReadable: entered.codeReadable === true,
      scannedWhenAvailable: entered.scannedWhenAvailable ?? null,
    };
    try {
      const response = await fetch(apiUrl(`/api/label-tests/${result.id}/physical-validation`), {
        method: "POST",
        headers: { ...bearerHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ validation: payload }),
      });
      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }
      const body = (await response.json()) as {
        status: string;
        physicalValidation: PhysicalValidation;
      };
      setResults((current) =>
        current.map((entry) =>
          entry.id === result.id
            ? {
                ...entry,
                physicalValidation: body.physicalValidation,
                checks: { ...entry.checks, physicalPrint: body.status },
              }
            : entry,
        ),
      );
      setNotice(
        body.status === "PHYSICALLY_VALIDATED"
          ? "Le contrôle physique a été confirmé manuellement."
          : "Le contrôle physique indique une anomalie ; le modèle reste non conforme.",
      );
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Le contrôle physique n’a pas pu être enregistré.",
      );
    }
  }

  function exportReport(result: AnalysisResult) {
    const report = {
      carrierSelected: result.selectedCategory,
      carrierDetected: result.carrier,
      modelName: result.modelName,
      testedAt: result.createdAt,
      source: { format: result.sourceFormat, ...result.sourceDimensions },
      extractedRegion: result.extractedRegion,
      preparedDimensions: result.preparedDimensions,
      strategy: result.strategy,
      adaptation: result.adaptation,
      proportionsPreserved: result.proportionsPreserved,
      automaticChecks: result.checks,
      warnings: result.warnings,
      visualReviewPassed: result.visualReviewed,
      physicalValidation: result.physicalValidation ?? null,
      status: resultStatus(result),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `label-test-${result.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteResult(result: AnalysisResult) {
    if (!token) return;
    const response = await fetch(apiUrl(`/api/label-tests/${result.id}`), {
      method: "DELETE",
      headers: bearerHeaders(token),
    });
    if (!response.ok && response.status !== 404) {
      setError(await readApiError(response));
      return;
    }
    for (const url of Object.values(result.previewUrls)) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current = previewUrlsRef.current.filter((previewUrl) => previewUrl !== url);
    }
    setResults((current) => current.filter((entry) => entry.id !== result.id));
    if (activeResultId === result.id) setActiveResultId(null);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h4" sx={{ color: "#003B7A", fontWeight: 800 }}>
          Centre de test des étiquettes
        </Typography>
        <Typography color="text.secondary">
          Analysez et comparez les PDF avec le moteur réel, sans impression automatique.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" color="primary">
              1. Choisir le modèle
            </Typography>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CARRIERS.map((carrier) => (
                <MenuItem key={carrier.value} value={carrier.value}>
                  {carrier.label}
                </MenuItem>
              ))}
            </Select>
            <Box
              component="input"
              aria-label="Nom du modèle"
              placeholder="Variante ou nom du modèle (facultatif)"
              value={modelName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setModelName(event.target.value)}
              sx={{ p: 1.5, border: "1px solid #C8D5E3", borderRadius: 2, font: "inherit" }}
            />
            <Button variant="outlined" onClick={() => inputRef.current?.click()}>
              Sélectionner un ou plusieurs PDF
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              hidden
              onChange={(event) => selectFiles(event.target.files)}
            />
            {files.length > 0 && (
              <Stack spacing={0.5}>
                {files.map((file) => (
                  <Typography key={`${file.name}-${file.size}`} variant="body2">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} Mo
                  </Typography>
                ))}
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary">
              PDF uniquement · maximum 10 Mo chacun et 5 fichiers par analyse. Les fichiers restent
              temporairement sur ce poste et sont supprimés après 30 minutes ou à votre demande.
            </Typography>
            <Button
              variant="contained"
              color="secondary"
              disabled={!files.length || busy}
              startIcon={busy ? <CircularProgress size={18} /> : <PictureAsPdfRoundedIcon />}
              onClick={() => void analyze()}
            >
              {busy ? "Analyse en cours…" : "Lancer l’analyse"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
              Analyses récentes
            </Typography>
            <Stack spacing={1}>
              {results.map((result) => (
                <Stack key={result.id} direction="row" spacing={1} alignItems="center">
                  <Button
                    variant={result.id === activeResultId ? "contained" : "outlined"}
                    onClick={() => setActiveResultId(result.id)}
                    sx={{ flexGrow: 1, justifyContent: "flex-start" }}
                  >
                    {CARRIERS.find((carrier) => carrier.value === result.selectedCategory)?.label} ·{" "}
                    {result.modelName} · {resultStatus(result)}
                  </Button>
                  <Button
                    aria-label="Exporter le rapport JSON"
                    onClick={() => exportReport(result)}
                  >
                    <DownloadRoundedIcon />
                  </Button>
                  <Button
                    aria-label="Supprimer l’analyse"
                    onClick={() => void deleteResult(result)}
                  >
                    <DeleteOutlineRoundedIcon />
                  </Button>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {activeResult && (
        <>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6" color="primary">
                  Rapport de contrôle qualité
                </Typography>
                <Typography>
                  Détecté : {activeResult.carrier} · Modèle : {activeResult.modelName} · Méthode :{" "}
                  {activeResult.strategy}
                </Typography>
                <Typography>
                  Catégorie sélectionnée :{" "}
                  {
                    CARRIERS.find((carrier) => carrier.value === activeResult.selectedCategory)
                      ?.label
                  }
                </Typography>
                <Typography>
                  Source : {activeResult.sourceDimensions.widthPoints.toFixed(1)} ×{" "}
                  {activeResult.sourceDimensions.heightPoints.toFixed(1)} pt ·{" "}
                  {activeResult.sourceDimensions.orientation} ·{" "}
                  {activeResult.sourceDimensions.pageCount} page(s)
                </Typography>
                <Typography>
                  Final : {activeResult.preparedDimensions.widthPoints.toFixed(2)} ×{" "}
                  {activeResult.preparedDimensions.heightPoints.toFixed(2)} pt ·{" "}
                  {activeResult.adaptation}
                </Typography>
                <Typography fontWeight={800}>Statut : {resultStatus(activeResult)}</Typography>
                {activeResult.warnings.map((warning) => (
                  <Alert key={warning} severity="warning">
                    {warning}
                  </Alert>
                ))}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={activeResult.visualReviewed}
                      onChange={(event) =>
                        setResults((current) =>
                          current.map((entry) =>
                            entry.id === activeResult.id
                              ? { ...entry, visualReviewed: event.target.checked }
                              : entry,
                          ),
                        )
                      }
                    />
                  }
                  label="J’ai comparé les trois vues et validé visuellement le contenu."
                />
              </Stack>
            </CardContent>
          </Card>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" },
              gap: 2,
            }}
          >
            {(
              [
                ["original", "A — PDF original"],
                ["extracted", "B — Zone réellement extraite"],
                ["prepared", "C — PDF final 100 × 150 mm"],
              ] as const
            ).map(([view, title]) => (
              <Card key={view} variant="outlined">
                <CardContent>
                  <Typography fontWeight={800} sx={{ mb: 1 }}>
                    {title}
                  </Typography>
                  <Box
                    sx={{
                      maxHeight: 620,
                      overflow: "auto",
                      bgcolor: "#F4F6F8",
                      textAlign: "center",
                    }}
                  >
                    <Document file={activeResult.previewUrls[view]}>
                      <Page
                        pageNumber={1}
                        width={view === "original" ? 500 : 360}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" color="primary">
                  Test physique — action manuelle uniquement
                </Typography>
                {!activeResult.physicalPrintRequested ? (
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<PrintRoundedIcon />}
                    disabled={printBusyId !== null}
                    onClick={() => void requestPhysicalPrint(activeResult)}
                  >
                    Imprimer une étiquette de test
                  </Button>
                ) : (
                  <>
                    <Alert severity="info">
                      Demande transmise une fois. Inspectez l’étiquette imprimée avant de renseigner
                      le résultat.
                    </Alert>
                    <FormGroup>
                      {PHYSICAL_FIELDS.map(([field, label]) => (
                        <FormControlLabel
                          key={field}
                          control={
                            <Checkbox
                              checked={validation[activeResult.id]?.[field] === true}
                              onChange={(event) =>
                                setValidation((current) => ({
                                  ...current,
                                  [activeResult.id]: {
                                    ...current[activeResult.id],
                                    [field]: event.target.checked,
                                  },
                                }))
                              }
                            />
                          }
                          label={label}
                        />
                      ))}
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={validation[activeResult.id]?.scannedWhenAvailable === true}
                            onChange={(event) =>
                              setValidation((current) => ({
                                ...current,
                                [activeResult.id]: {
                                  ...current[activeResult.id],
                                  scannedWhenAvailable: event.target.checked,
                                },
                              }))
                            }
                          />
                        }
                        label="Code scanné avec succès (si matériel de contrôle disponible)"
                      />
                    </FormGroup>
                    <Button
                      variant="outlined"
                      onClick={() => void savePhysicalValidation(activeResult)}
                    >
                      Enregistrer mon contrôle physique
                    </Button>
                    {activeResult.physicalValidation && (
                      <Alert
                        severity={resultStatus(activeResult) === "Conforme" ? "success" : "warning"}
                      >
                        Résultat du contrôle physique : {resultStatus(activeResult)}
                      </Alert>
                    )}
                  </>
                )}
                <Typography variant="caption" color="text.secondary">
                  Le serveur accepte une seule demande par analyse et ne considère jamais son
                  acceptation comme une preuve d’impression physique.
                </Typography>
                {activeResult.selectedCategory === "RELAIS_COLIS" && (
                  <Alert severity="info">
                    Relais Colis est enregistré comme catégorie de test, mais le moteur actuel ne
                    dispose pas encore d’une stratégie de détection dédiée à ce transporteur.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
      <Box sx={{ display: "none" }}>
        <CheckCircleRoundedIcon />
      </Box>
    </Stack>
  );
}
