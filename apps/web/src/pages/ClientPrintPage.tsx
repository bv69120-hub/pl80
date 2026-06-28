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

export function ClientPrintPage() {
  const { token } = useParams<{ token: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
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

  if (availability === "loading")
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );

  if (availability !== "available") {
    const unavailableMessage =
      availability === "disabled"
        ? "Le mode client est actuellement désactivé."
        : availability === "unreachable"
          ? "L’API d’impression est inaccessible. Vérifiez la connexion au réseau local."
          : "Ce QR Code est expiré ou invalide.";
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          bgcolor: "background.default",
          p: 2,
        }}
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

  if (isComplete)
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "primary.main",
          display: "grid",
          placeItems: "center",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 560, width: "100%" }}>
          <CardContent sx={{ p: { xs: 4, sm: 6 }, textAlign: "center" }}>
            <CheckCircleRoundedIcon color="success" sx={{ fontSize: 84 }} />
            <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
              C’est parti !
            </Typography>
            <Typography variant="h6" color="text.secondary" fontWeight={500}>
              Votre bordereau est en cours d’impression.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #F5F8FC 55%, #E5EEF8 100%)",
        py: { xs: 3, md: 6 },
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3}>
          <Box textAlign="center">
            <Box
              sx={{
                display: "inline-grid",
                placeItems: "center",
                width: 52,
                height: 52,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "secondary.main",
                fontWeight: 900,
                mb: 2,
              }}
            >
              BX
            </Box>
            <Typography variant="h4" color="primary.dark">
              Imprimer votre bordereau
            </Typography>
            <Typography color="text.secondary">
              Déposez votre PDF, vérifiez-le, puis imprimez.
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="overline" color="primary.main" fontWeight={900}>
                    Étape 1
                  </Typography>
                  <Typography variant="h6">Choisir un PDF</Typography>
                </Box>
                <Box
                  onClick={() => inputRef.current?.click()}
                  sx={{
                    cursor: "pointer",
                    border: "3px dashed",
                    borderColor: file ? "success.main" : "secondary.dark",
                    bgcolor: file ? "#EAF7EF" : "#FFFBE7",
                    borderRadius: 2,
                    minHeight: 150,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                    p: 3,
                  }}
                >
                  <Stack alignItems="center" spacing={1}>
                    <CloudUploadOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
                    <Typography fontWeight={800}>
                      {file?.name ?? "Toucher pour choisir votre PDF"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      PDF uniquement · 10 Mo maximum
                    </Typography>
                  </Stack>
                </Box>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={selectFile}
                />
                <Box>
                  <Typography variant="overline" color="primary.main" fontWeight={900}>
                    Étape 2
                  </Typography>
                  <Typography variant="h6">Aperçu du PDF</Typography>
                </Box>
                <Box
                  sx={{
                    minHeight: 300,
                    maxHeight: 500,
                    overflow: "auto",
                    bgcolor: "#E8EEF5",
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    p: 2,
                  }}
                >
                  {previewUrl ? (
                    <Document
                      file={previewUrl}
                      onLoadSuccess={({ numPages }) => setPageCount(numPages)}
                      loading={<CircularProgress />}
                    >
                      {pageCount > 0 && (
                        <Page
                          pageNumber={1}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      )}
                    </Document>
                  ) : (
                    <Stack alignItems="center" spacing={1}>
                      <PictureAsPdfOutlinedIcon sx={{ fontSize: 58, color: "text.secondary" }} />
                      <Typography color="text.secondary">L’aperçu apparaîtra ici</Typography>
                    </Stack>
                  )}
                </Box>
                <Box>
                  <Typography variant="overline" color="primary.main" fontWeight={900}>
                    Étape 3
                  </Typography>
                  <Button
                    fullWidth
                    variant="contained"
                    color="secondary"
                    size="large"
                    startIcon={
                      isPrinting ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <PrintRoundedIcon />
                      )
                    }
                    disabled={!file || isPrinting}
                    onClick={() => void print()}
                    sx={{ minHeight: 62, fontSize: 18 }}
                  >
                    {isPrinting ? "Envoi…" : "Imprimer"}
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
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
