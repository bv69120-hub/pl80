import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { useAuth } from "../auth/useAuth";
import { apiUrl } from "../api/apiUrl";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const printers = [{ value: "PL80E", label: "PL80E" }];

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} octets`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export function NewLabelPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [printer, setPrinter] = useState("PL80E");
  const [isDragging, setIsDragging] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!selectedFile) {
      setPageCount(null);
      return;
    }

    setPageCount(null);
  }, [selectedFile]);

  async function uploadFile(file: File) {
    if (!token) {
      setUploadError("Vous devez être connecté pour envoyer un bordereau.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("copies", String(copies));
      formData.append("printerName", printer);

      const response = await fetch(apiUrl("/api/print-jobs"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Échec de l'envoi du bordereau.");
      }

      setUploadSuccess("Votre bordereau a été ajouté à la file d’impression.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Échec de l'envoi du bordereau.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.item(0);

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(null);
      setUploadError("Veuillez sélectionner un fichier PDF valide.");
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setPageCount(null);
    setUploadError(null);
    setUploadSuccess(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Nouveau bordereau
        </Typography>
        <Typography color="text.secondary">
          Préparez un PDF, choisissez l'imprimante cible et le nombre de copies.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <Box
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  sx={{
                    minHeight: 330,
                    border: "3px dashed",
                    borderColor: isDragging ? "primary.main" : "secondary.dark",
                    borderRadius: 2,
                    bgcolor: isDragging ? "primary.light" : "#FFFBE7",
                    display: "grid",
                    placeItems: "center",
                    p: 3,
                    textAlign: "center",
                    transition: "160ms ease",
                  }}
                >
                  <Stack spacing={2} alignItems="center">
                    <Box
                      sx={{
                        width: 82,
                        height: 82,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: "secondary.main",
                        color: "primary.dark",
                      }}
                    >
                      <CloudUploadOutlinedIcon sx={{ fontSize: 44 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6">Glisser-déposer un bordereau PDF</Typography>
                      <Typography color="text.secondary">
                        Un seul fichier sera préparé à la fois.
                      </Typography>
                    </Box>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="application/pdf"
                      hidden
                      onChange={handleInputChange}
                    />
                    <Button variant="contained" onClick={() => inputRef.current?.click()}>
                      Parcourir
                    </Button>
                  </Stack>
                </Box>

                {selectedFile && (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    sx={{ p: 2, borderRadius: 1, bgcolor: "background.default" }}
                  >
                    <InsertDriveFileOutlinedIcon color="primary" />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800 }} noWrap>
                        {selectedFile.name}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={formatFileSize(selectedFile.size)} size="small" />
                        <Chip
                          label={
                            pageCount
                              ? `${pageCount} page${pageCount > 1 ? "s" : ""}`
                              : "Analyse en cours..."
                          }
                          size="small"
                        />
                      </Stack>
                    </Box>
                    <Button
                      color="error"
                      variant="outlined"
                      startIcon={<DeleteOutlineOutlinedIcon />}
                      onClick={handleRemoveFile}
                    >
                      Supprimer
                    </Button>
                  </Stack>
                )}

                {uploadError && <Alert severity="error">{uploadError}</Alert>}
                {uploadSuccess && <Alert severity="success">{uploadSuccess}</Alert>}
                {isUploading && <Alert severity="info">Téléversement du PDF en cours...</Alert>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack spacing={2.5}>
                  <Typography variant="h6">Paramètres d'impression</Typography>
                  <TextField
                    label="Nombre de copies"
                    type="number"
                    value={copies}
                    onChange={(event) =>
                      setCopies(Math.max(1, Math.min(99, Number(event.target.value) || 1)))
                    }
                    inputProps={{ min: 1, max: 99 }}
                    fullWidth
                  />
                  <FormControl fullWidth>
                    <InputLabel id="printer-label">Imprimante</InputLabel>
                    <Select
                      labelId="printer-label"
                      label="Imprimante"
                      value={printer}
                      onChange={(event) => setPrinter(event.target.value)}
                    >
                      {printers.map((printerOption) => (
                        <MenuItem key={printerOption.value} value={printerOption.value}>
                          {printerOption.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ p: 1.5, borderRadius: 2, bgcolor: "#EAF7EF" }}
                  >
                    <Box
                      sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: "success.main" }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Imprimante sélectionnée
                      </Typography>
                      <Typography fontWeight={800}>PL80E · Prête</Typography>
                    </Box>
                  </Stack>
                  <Button
                    variant="contained"
                    color="secondary"
                    size="large"
                    startIcon={<PrintOutlinedIcon />}
                    disabled={!selectedFile || isUploading}
                    onClick={() => selectedFile && void uploadFile(selectedFile)}
                    sx={{ minHeight: 58, fontSize: 17 }}
                  >
                    {isUploading ? "ENVOI EN COURS…" : "IMPRIMER"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">Aperçu PDF</Typography>
                  <Divider />
                  <Box
                    sx={{
                      minHeight: 360,
                      borderRadius: 1,
                      bgcolor: "#E8EEF5",
                      border: "1px solid",
                      borderColor: "divider",
                      display: "grid",
                      placeItems: "center",
                      p: 3,
                      textAlign: "center",
                    }}
                  >
                    {selectedFile ? (
                      <Box sx={{ width: "100%", maxHeight: 560, overflow: "auto" }}>
                        <Document
                          file={selectedFile}
                          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
                          onLoadError={() => setPageCount(null)}
                        >
                          {pageCount
                            ? Array.from({ length: pageCount }, (_, index) => (
                                <Box key={index + 1} sx={{ mb: 2 }}>
                                  <Page
                                    pageNumber={index + 1}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                  />
                                </Box>
                              ))
                            : null}
                        </Document>
                      </Box>
                    ) : (
                      <Stack spacing={1.5} alignItems="center">
                        <PictureAsPdfOutlinedIcon color="secondary" sx={{ fontSize: 56 }} />
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          Aperçu indisponible
                        </Typography>
                        <Typography color="text.secondary">
                          Sélectionnez un PDF pour l’afficher ici.
                        </Typography>
                      </Stack>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
