import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useParams } from "react-router-dom";
import { apiUrl } from "../api/apiUrl";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CARRIERS = ["Vinted", "Chronopost", "Colissimo", "Mondial Relay", "UPS", "DHL", "GLS", "DPD"];
const STEPS = ["Choisir le PDF", "Vérifier l’aperçu", "Imprimer"];

function StepProgress({
  activeStep,
  complete = false,
  isPrinting = false,
}: {
  activeStep: number;
  complete?: boolean;
  isPrinting?: boolean;
}) {
  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 1.75, sm: 3 } }}>
        <Box
          sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: { xs: 0.5, sm: 2 } }}
        >
          {STEPS.map((label, index) => {
            const isDone = complete || index < activeStep;
            const isActive = !complete && index === activeStep;
            const displayedLabel = index === 2 && isPrinting ? "Impression..." : label;

            return (
              <Stack key={label} alignItems="center" spacing={0.75} textAlign="center">
                <Box
                  sx={{
                    width: { xs: 34, sm: 42 },
                    height: { xs: 34, sm: 42 },
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    bgcolor: isDone || isActive ? "#003B7A" : "#E5ECF4",
                    color: isDone || isActive ? "#FFFFFF" : "#60758C",
                    boxShadow: isActive ? "0 0 0 4px rgba(255, 212, 0, 0.45)" : "none",
                    fontWeight: 900,
                  }}
                >
                  {isDone ? (
                    <CheckCircleRoundedIcon sx={{ fontSize: { xs: 24, sm: 28 } }} />
                  ) : index === 2 && isPrinting ? (
                    <CircularProgress size={20} thickness={5} color="inherit" />
                  ) : (
                    index + 1
                  )}
                </Box>
                <Typography
                  fontWeight={isActive ? 900 : 700}
                  color={isActive || isDone ? "text.primary" : "text.secondary"}
                  sx={{ fontSize: { xs: 11, sm: 16 }, lineHeight: 1.2 }}
                >
                  {displayedLabel}
                </Typography>
              </Stack>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}

export function ClientPrintPage() {
  const { token } = useParams<{ token: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    "loading" | "available" | "disabled" | "invalid" | "unreachable"
  >("loading");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setAvailability("invalid");
      return;
    }
    fetch(apiUrl(`/api/client-print/${encodeURIComponent(token)}/status`))
      .then(async (response) => {
        const result = (await response.json()) as { reason?: string };
        if (response.ok) setAvailability("available");
        else setAvailability(result.reason === "DISABLED" ? "disabled" : "invalid");
      })
      .catch(() => setAvailability("unreachable"));
  }, [token]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.item(0);
    setError(null);
    setIsComplete(false);
    setPageCount(0);
    setIsPreviewReady(false);
    if (!selected) return;
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Veuillez choisir un fichier PDF.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Le PDF ne doit pas dépasser 10 Mo.");
      return;
    }
    setFile(selected);
  }

  function restart() {
    setFile(null);
    setPageCount(0);
    setIsPreviewReady(false);
    setError(null);
    setIsComplete(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function print() {
    if (!file) return;
    setIsPrinting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl(`/api/client-print/${encodeURIComponent(token ?? "")}`), {
        method: "POST",
        body,
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Impossible de lancer l’impression.");
      setIsComplete(true);
    } catch (printError) {
      setError(
        printError instanceof Error ? printError.message : "Impossible de lancer l’impression.",
      );
    } finally {
      setIsPrinting(false);
    }
  }

  if (availability === "loading") {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#F5F8FC" }}>
        <CircularProgress sx={{ color: "#003B7A" }} />
      </Box>
    );
  }

  if (availability !== "available") {
    const unavailableMessage =
      availability === "disabled"
        ? "Le mode client est actuellement désactivé."
        : availability === "unreachable"
          ? "L’API d’impression est inaccessible. Vérifiez la connexion au réseau local."
          : "Ce QR Code est expiré ou invalide.";
    return (
      <Box
        sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#F5F8FC", p: 2 }}
      >
        <Card sx={{ maxWidth: 600 }}>
          <CardContent sx={{ p: { xs: 4, sm: 6 }, textAlign: "center" }}>
            <PrintRoundedIcon color="disabled" sx={{ fontSize: 72 }} />
            <Typography variant="h5" sx={{ mt: 2 }}>
              {unavailableMessage}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (isComplete) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "#003B7A",
          display: "grid",
          placeItems: "center",
          p: { xs: 1.5, sm: 3 },
        }}
      >
        <Stack spacing={2.5} sx={{ maxWidth: 620, width: "100%" }}>
          <StepProgress activeStep={3} complete />
          <Card sx={{ width: "100%", borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 3, sm: 6 }, textAlign: "center" }}>
              <CheckCircleRoundedIcon
                sx={{ color: "success.main", fontSize: { xs: 76, sm: 92 } }}
              />
              <Typography
                component="h1"
                variant="h4"
                sx={{ mt: 2, color: "#003B7A", fontSize: { xs: 27, sm: 34 } }}
              >
                Votre bordereau a été envoyé.
              </Typography>
              <Typography sx={{ mt: 2, fontSize: { xs: 18, sm: 20 }, fontWeight: 700 }}>
                Votre impression est en cours sur la PL80E.
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ mt: 1, mb: 4, fontSize: { xs: 16, sm: 18 } }}
              >
                Merci de patienter quelques secondes.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                size="large"
                onClick={restart}
                sx={{ minHeight: 64, fontSize: 18 }}
              >
                Imprimer un autre bordereau
              </Button>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    );
  }

  const activeStep = !file ? 0 : isPreviewReady ? 2 : 1;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #F5F8FC 55%, #E5EEF8 100%)",
        py: { xs: 1.5, sm: 3, md: 5 },
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={{ xs: 2, sm: 3 }}>
          <Box textAlign="center">
            <Box
              sx={{
                display: "inline-grid",
                placeItems: "center",
                width: 54,
                height: 54,
                borderRadius: "50%",
                bgcolor: "#003B7A",
                color: "#FFD400",
                fontWeight: 900,
                mb: 1,
              }}
            >
              BV
            </Box>
            <Typography
              component="h1"
              variant="h4"
              sx={{ color: "#003B7A", fontSize: { xs: 27, sm: 34 } }}
            >
              Imprimez votre bordereau
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: { xs: 14, sm: 16 } }}>
              Scannez • Choisissez votre PDF • Imprimez
            </Typography>
          </Box>

          <StepProgress activeStep={activeStep} isPrinting={isPrinting} />

          {error && <Alert severity="error">{error}</Alert>}

          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
              <Typography variant="h6" sx={{ mb: 2, color: "#003B7A" }}>
                1. Choisir le PDF
              </Typography>
              <Box
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                }}
                sx={{
                  cursor: "pointer",
                  border: "3px dashed",
                  borderColor: file ? "success.main" : "#003B7A",
                  bgcolor: file ? "#EAF7EF" : "#FFFBE7",
                  borderRadius: 2,
                  minHeight: 156,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  p: { xs: 2, sm: 3 },
                }}
              >
                <Stack alignItems="center" spacing={1} sx={{ minWidth: 0, maxWidth: "100%" }}>
                  <CloudUploadOutlinedIcon sx={{ color: "#003B7A", fontSize: 48 }} />
                  <Typography
                    fontWeight={800}
                    sx={{
                      maxWidth: "100%",
                      overflowWrap: "anywhere",
                      fontSize: { xs: 16, sm: 18 },
                    }}
                  >
                    {file?.name ?? "📄 Sélectionner mon bordereau"}
                  </Typography>
                  <Stack spacing={0}>
                    <Typography variant="body2" color="text.secondary">
                      PDF uniquement
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      10 Mo maximum
                    </Typography>
                  </Stack>
                </Stack>
              </Box>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={selectFile}
              />
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
              <Typography variant="h6" sx={{ mb: 2, color: "#003B7A" }}>
                2. Vérifier l’aperçu
              </Typography>
              <Box
                sx={{
                  minHeight: { xs: 260, sm: 360 },
                  maxHeight: 520,
                  overflow: "auto",
                  bgcolor: "#E8EEF5",
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  p: { xs: 1, sm: 2 },
                  "& .react-pdf__Page": { maxWidth: "100%" },
                  "& canvas": { maxWidth: "100%", height: "auto !important" },
                }}
              >
                {previewUrl ? (
                  <Document
                    file={previewUrl}
                    onLoadSuccess={({ numPages }) => setPageCount(numPages)}
                    loading={<CircularProgress />}
                    error={<Typography color="error">Aperçu indisponible.</Typography>}
                  >
                    {pageCount > 0 && (
                      <Page
                        pageNumber={1}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        onRenderSuccess={() => setIsPreviewReady(true)}
                      />
                    )}
                  </Document>
                ) : (
                  <Stack alignItems="center" spacing={1} textAlign="center">
                    <PictureAsPdfOutlinedIcon sx={{ fontSize: 58, color: "text.secondary" }} />
                    <Typography color="text.secondary">Votre aperçu apparaîtra ici</Typography>
                  </Stack>
                )}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
              <Typography variant="h6" sx={{ mb: 2, color: "#003B7A" }}>
                3. Imprimer
              </Typography>
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                size="large"
                startIcon={
                  isPrinting ? <CircularProgress size={20} color="inherit" /> : <PrintRoundedIcon />
                }
                disabled={!file || isPrinting}
                onClick={() => void print()}
                sx={{ minHeight: 64, fontSize: 19 }}
              >
                {isPrinting ? "Impression..." : "Imprimer mon bordereau"}
              </Button>
              <Typography
                variant="caption"
                color="text.secondary"
                textAlign="center"
                display="block"
                sx={{ mt: 1 }}
              >
                1 copie · Imprimante PL80E
              </Typography>
            </CardContent>
          </Card>

          <Box textAlign="center" sx={{ pt: { xs: 1, sm: 2 }, pb: 2 }}>
            <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.5 }}>
              Transporteurs compatibles
            </Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" gap={1}>
              {CARRIERS.map((carrier) => (
                <Chip
                  key={carrier}
                  label={carrier}
                  sx={{ bgcolor: "#FFFFFF", color: "#003B7A", border: "1px solid #DCE6F1" }}
                />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
