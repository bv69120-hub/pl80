import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LocalPrintshopOutlinedIcon from "@mui/icons-material/LocalPrintshopOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
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
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useParams } from "react-router-dom";
import { apiUrl } from "../api/apiUrl";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

declare global {
  interface Window {
    bvCloudPortal?: {
      storeId: string;
      uploadToken: string;
    };
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CARRIERS = ["Vinted", "Chronopost", "Colissimo", "Mondial Relay", "UPS", "DHL", "GLS", "DPD"];
const STEPS = ["Sélectionnez votre PDF", "Vérifiez votre bordereau", "Lancez l’impression"];

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mo`;
}

function PortalShell({ children }: { children: ReactNode }) {
  return (
    <Box className="client-portal-shell">
      <Container maxWidth="sm" sx={{ py: { xs: 2.5, sm: 5 } }}>
        <Stack spacing={{ xs: 2, sm: 2.5 }}>{children}</Stack>
      </Container>
    </Box>
  );
}

function PortalFooter() {
  return (
    <Box className="client-portal-footer">
      <Box className="client-portal-brand-mark small">BV</Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        Votre expédition, en toute simplicité
      </Typography>
    </Box>
  );
}

function PortalLoading() {
  return (
    <PortalShell>
      <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ py: 7, textAlign: "center" }}>
          <CircularProgress sx={{ color: "#003B7A" }} />
          <Typography sx={{ mt: 2 }} color="text.secondary">
            Vérification de votre espace sécurisé…
          </Typography>
        </CardContent>
      </Card>
    </PortalShell>
  );
}

function PortalMessage({ message }: { message: string }) {
  return (
    <PortalShell>
      <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 4, sm: 6 }, textAlign: "center" }}>
          <Box className="client-portal-unavailable-icon">
            <ErrorOutlineRoundedIcon />
          </Box>
          <Typography component="h1" variant="h5" sx={{ mt: 2, color: "#003B7A" }}>
            {message}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Si le problème persiste, notre équipe en magasin peut vous aider.
          </Typography>
        </CardContent>
      </Card>
      <PortalFooter />
    </PortalShell>
  );
}

function StepProgress({
  activeStep,
  isSending = false,
}: {
  activeStep: number;
  isSending?: boolean;
}) {
  return (
    <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box
          sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: { xs: 0.5, sm: 2 } }}
        >
          {STEPS.map((label, index) => {
            const isDone = index < activeStep;
            const isActive = index === activeStep;
            return (
              <Stack
                key={label}
                alignItems="center"
                spacing={1}
                textAlign="center"
                aria-current={isActive ? "step" : undefined}
              >
                <Box
                  sx={{
                    width: { xs: 38, sm: 46 },
                    height: { xs: 38, sm: 46 },
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    bgcolor: isDone ? "#008C3A" : isActive ? "#003B7A" : "#EEF2F7",
                    color: isDone || isActive ? "#FFFFFF" : "#718096",
                    boxShadow: isActive ? "0 0 0 5px rgba(255, 212, 0, 0.35)" : "none",
                    fontWeight: 900,
                    transition: "background-color 180ms ease, box-shadow 180ms ease",
                  }}
                >
                  {isDone ? (
                    <CheckCircleRoundedIcon sx={{ fontSize: { xs: 24, sm: 28 } }} />
                  ) : index === 2 && isSending ? (
                    <CircularProgress size={20} thickness={5} color="inherit" />
                  ) : (
                    index + 1
                  )}
                </Box>
                <Typography
                  fontWeight={isActive ? 900 : 700}
                  color={isActive || isDone ? "text.primary" : "text.secondary"}
                  sx={{ fontSize: { xs: 12, sm: 14 }, lineHeight: 1.25 }}
                >
                  {index === 2 && isSending ? "Envoi en cours…" : label}
                </Typography>
              </Stack>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}

function PreviewFallback({ file }: { file: File }) {
  return (
    <Stack alignItems="center" spacing={1} textAlign="center" sx={{ maxWidth: "100%", p: 2 }}>
      <PictureAsPdfOutlinedIcon sx={{ fontSize: 58, color: "#003B7A" }} />
      <Typography fontWeight={900} sx={{ maxWidth: "100%", overflowWrap: "anywhere" }}>
        {file.name}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {formatFileSize(file.size)}
      </Typography>
      <Typography fontWeight={800} color="success.main">
        PDF prêt à envoyer
      </Typography>
    </Stack>
  );
}

export function ClientPrintPage({ mode }: { mode: "local" | "cloud" }) {
  const { token } = useParams<{ token: string }>();
  const { storeId } = useParams<{ storeId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [hasPreviewFailed, setHasPreviewFailed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasQueuedJob, setHasQueuedJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canSafelyRetry, setCanSafelyRetry] = useState(false);
  const [availability, setAvailability] = useState<
    "loading" | "available" | "disabled" | "invalid" | "unreachable"
  >("loading");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "cloud") {
      const portal = window.bvCloudPortal;
      setAvailability(
        portal && portal.storeId === storeId && portal.uploadToken ? "available" : "invalid",
      );
      return;
    }
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
  }, [mode, storeId, token]);

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
    setCanSafelyRetry(false);
    setHasQueuedJob(false);
    setPageCount(0);
    setIsPreviewReady(false);
    setHasPreviewFailed(false);
    if (!selected) return;
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Veuillez choisir un fichier PDF.");
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("Le PDF ne doit pas dépasser 10 Mo.");
      event.target.value = "";
      return;
    }
    setFile(selected);
  }

  function restart() {
    if (mode === "cloud") {
      window.location.reload();
      return;
    }
    setFile(null);
    setPageCount(0);
    setIsPreviewReady(false);
    setHasPreviewFailed(false);
    setError(null);
    setCanSafelyRetry(false);
    setHasQueuedJob(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function print() {
    if (!file || isSending) return;
    setIsSending(true);
    setError(null);
    setCanSafelyRetry(false);
    try {
      const body = new FormData();
      body.append("file", file);
      const endpoint =
        mode === "cloud"
          ? `/api/jobs/${encodeURIComponent(storeId ?? "")}`
          : apiUrl(`/api/client-print/${encodeURIComponent(token ?? "")}`);
      if (mode === "cloud") body.append("token", window.bvCloudPortal?.uploadToken ?? "");
      const response = await fetch(endpoint, {
        method: "POST",
        body,
        headers: mode === "cloud" ? { Accept: "application/json" } : undefined,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const result = contentType.includes("application/json")
        ? ((await response.json()) as { message?: string })
        : {
            message: (await response.text())
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          };
      if (!response.ok) {
        setError(result.message ?? "Impossible de transmettre votre demande d’impression.");
        setCanSafelyRetry(response.status === 429);
        return;
      }
      setHasQueuedJob(true);
    } catch (requestError) {
      console.error("Client print request outcome is unknown.", requestError);
      setError(
        "La connexion a été interrompue et nous ne pouvons pas confirmer si votre demande a été reçue. Pour éviter un doublon, ne renvoyez pas le fichier tout de suite : demandez à l’équipe de vérifier l’imprimante.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (availability === "loading") return <PortalLoading />;

  if (availability !== "available") {
    const unavailableMessage =
      availability === "disabled"
        ? "Le mode client est actuellement désactivé."
        : availability === "unreachable"
          ? "L’API d’impression est inaccessible. Vérifiez la connexion au réseau local."
          : "Ce QR Code est expiré ou invalide.";
    return <PortalMessage message={unavailableMessage} />;
  }

  if (hasQueuedJob) {
    return (
      <PortalShell>
        <StepProgress activeStep={2} />
        <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 3, sm: 5 }, textAlign: "center" }}>
            <Box className="client-portal-success-icon">
              <CheckCircleRoundedIcon sx={{ fontSize: { xs: 54, sm: 64 } }} />
            </Box>
            <Chip
              icon={<LocalPrintshopOutlinedIcon />}
              label="En attente d’impression"
              color="primary"
              sx={{ mt: 2, mb: 1.5, fontWeight: 800 }}
            />
            <Typography
              component="h1"
              variant="h4"
              sx={{ color: "#003B7A", fontSize: { xs: 25, sm: 32 } }}
            >
              Votre demande a bien été transmise !
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: { xs: 15, sm: 17 } }}>
              Le serveur a accepté votre bordereau. L’équipe vérifie son traitement par
              l’imprimante.
            </Typography>
            <Alert severity="info" sx={{ mt: 3, textAlign: "left", borderRadius: 3 }}>
              La demande transmise ne confirme pas à elle seule que le bordereau est sorti de
              l’imprimante. Si rien ne s’imprime, demandez à l’équipe de vérifier avant tout nouvel
              envoi.
            </Alert>
            <Button
              fullWidth
              variant="contained"
              color="secondary"
              size="large"
              startIcon={<RestartAltRoundedIcon />}
              onClick={restart}
              sx={{ mt: 3, minHeight: 58, fontSize: 17 }}
            >
              Imprimer un autre bordereau
            </Button>
          </CardContent>
        </Card>
        <PortalFooter />
      </PortalShell>
    );
  }

  const activeStep = !file ? 0 : isPreviewReady || hasPreviewFailed ? 2 : 1;

  return (
    <PortalShell>
      <Stack className="client-portal-content" spacing={{ xs: 2, sm: 2.5 }}>
        <Box textAlign="center">
          <Box className="client-portal-brand">
            <Box className="client-portal-brand-mark">BV</Box>
            <Typography
              component="span"
              sx={{ color: "#003B7A", fontWeight: 900, fontSize: 18, letterSpacing: "-0.04em" }}
            >
              Bureau Vallée
            </Typography>
          </Box>
          <Typography
            component="h1"
            variant="h4"
            sx={{ color: "#003B7A", fontSize: { xs: 28, sm: 38 }, lineHeight: 1.13, mt: 2 }}
          >
            Bienvenue dans votre espace expédition
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, fontSize: { xs: 15, sm: 18 } }}>
            Imprimez votre bordereau en quelques secondes !
          </Typography>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            justifyContent="center"
            sx={{ mt: 1.5, color: "#60758C" }}
          >
            <VerifiedOutlinedIcon sx={{ fontSize: 18, color: "#008C3A" }} />
            <Typography variant="caption" fontWeight={700}>
              Espace sécurisé Bureau Vallée
            </Typography>
          </Stack>
        </Box>

        <StepProgress activeStep={activeStep} isSending={isSending} />

        {error && (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
              <Typography variant="body2">{error}</Typography>
              {canSafelyRetry && (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => void print()}
                  disabled={isSending}
                >
                  Réessayer
                </Button>
              )}
            </Stack>
          </Alert>
        )}

        <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Box className="client-portal-section-icon">
                <DescriptionOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: "#003B7A", lineHeight: 1.25 }}>
                  1. Sélectionnez votre PDF
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Le bordereau fourni par votre transporteur
                </Typography>
              </Box>
            </Stack>
            <Box className={`client-portal-upload${file ? " has-file" : ""}`}>
              <Box className="client-portal-upload-icon">
                {file ? <PictureAsPdfOutlinedIcon /> : <CloudUploadOutlinedIcon />}
              </Box>
              <Typography fontWeight={800} sx={{ fontSize: { xs: 15, sm: 17 } }}>
                {file ? "Votre bordereau est prêt" : "Votre bordereau, en un geste"}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ maxWidth: 300, overflowWrap: "anywhere" }}
              >
                {file
                  ? `${file.name} · ${formatFileSize(file.size)}`
                  : "Choisissez le PDF de votre étiquette"}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                size="large"
                startIcon={<PictureAsPdfOutlinedIcon />}
                onClick={() => inputRef.current?.click()}
                sx={{ mt: 0.5, minHeight: 48, px: 3 }}
              >
                {file ? "Remplacer mon fichier" : "Choisir mon bordereau"}
              </Button>
              <Typography variant="caption" color="text.secondary">
                PDF uniquement · 10 Mo maximum
              </Typography>
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

        <Card className="client-portal-card" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Box>
                <Typography variant="h6" sx={{ color: "#003B7A", lineHeight: 1.25 }}>
                  2. Vérifiez votre bordereau
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Assurez-vous que le document est lisible
                </Typography>
              </Box>
              {file && pageCount > 0 && (
                <Chip
                  size="small"
                  label={`${pageCount} page${pageCount > 1 ? "s" : ""}`}
                  variant="outlined"
                />
              )}
            </Stack>
            <Box className="client-portal-preview">
              {previewUrl ? (
                <Document
                  file={previewUrl}
                  onLoadSuccess={({ numPages }) => setPageCount(numPages)}
                  onLoadError={() => setHasPreviewFailed(true)}
                  loading={<CircularProgress sx={{ color: "#003B7A" }} />}
                  error={file ? <PreviewFallback file={file} /> : null}
                >
                  {pageCount > 0 && (
                    <Page
                      pageNumber={1}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onRenderSuccess={() => setIsPreviewReady(true)}
                      onRenderError={() => setHasPreviewFailed(true)}
                      error={file ? <PreviewFallback file={file} /> : null}
                    />
                  )}
                </Document>
              ) : (
                <Stack alignItems="center" spacing={1.25} textAlign="center" sx={{ p: 3 }}>
                  <PictureAsPdfOutlinedIcon sx={{ fontSize: 52, color: "#8B9BAD" }} />
                  <Typography color="text.secondary">
                    Sélectionnez votre PDF pour afficher l’aperçu
                  </Typography>
                </Stack>
              )}
            </Box>
            {file && (
              <Typography
                variant="body2"
                color={hasPreviewFailed ? "warning.dark" : "text.secondary"}
                textAlign="center"
                sx={{ mt: 1.5 }}
              >
                {hasPreviewFailed
                  ? "L’aperçu ne peut pas être affiché, mais votre fichier PDF reste sélectionné."
                  : isPreviewReady
                    ? "Votre bordereau est prêt à être envoyé."
                    : "Préparation de l’aperçu…"}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card className="client-portal-card client-portal-print-card" sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Box className="client-portal-section-icon">
                <PrintRoundedIcon />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: "#003B7A", lineHeight: 1.25 }}>
                  3. Lancez l’impression
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Votre bordereau sera envoyé à l’équipe
                </Typography>
              </Box>
            </Stack>
            <Button
              fullWidth
              variant="contained"
              color="secondary"
              size="large"
              startIcon={
                isSending ? <CircularProgress size={20} color="inherit" /> : <PrintRoundedIcon />
              }
              disabled={!file || isSending || (!isPreviewReady && !hasPreviewFailed)}
              onClick={() => void print()}
              sx={{
                minHeight: 62,
                fontSize: { xs: 17, sm: 19 },
                borderRadius: 3,
                boxShadow: "0 8px 20px rgba(225, 186, 0, 0.24)",
              }}
            >
              {isSending
                ? "Envoi en cours…"
                : file && !isPreviewReady && !hasPreviewFailed
                  ? "Préparation de l’aperçu…"
                  : "Imprimer mon bordereau"}
            </Button>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="flex-start"
              justifyContent="center"
              sx={{ mt: 1.5, px: 0.5, color: "#60758C" }}
            >
              <VerifiedOutlinedIcon sx={{ fontSize: 17, mt: "2px", color: "#008C3A" }} />
              <Typography variant="caption" textAlign="center">
                1 copie · Imprimante PL80E · L’envoi du fichier ne confirme pas l’impression
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Box textAlign="center" sx={{ pt: 0.5, pb: 1 }}>
          <Typography variant="body2" fontWeight={800} color="text.secondary" sx={{ mb: 1.25 }}>
            Vos transporteurs, un seul endroit
          </Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" gap={0.75}>
            {CARRIERS.map((carrier) => (
              <Chip
                key={carrier}
                size="small"
                label={carrier}
                sx={{ bgcolor: "#FFFFFF", color: "#003B7A", border: "1px solid #DCE6F1" }}
              />
            ))}
          </Stack>
        </Box>
        <PortalFooter />
      </Stack>
    </PortalShell>
  );
}
