import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import { ChangeEvent, DragEvent, useRef, useState } from "react";

const printers = [
  { value: "pl80e", label: "PL80E - intégration prévue" },
  { value: "office-placeholder", label: "Imprimante bureau - placeholder" },
];

export function NewLabelPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
  const [printer, setPrinter] = useState("pl80e");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.item(0);

    if (file) {
      setSelectedFile(file);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Nouveau bordereau</Typography>
        <Typography color="text.secondary">
          Préparez un PDF, choisissez l'imprimante cible et le nombre de copies.
        </Typography>
      </Box>

      <Alert severity="info">
        L'intégration PL80E est prévue pour une prochaine étape. Cette V1 ne déclenche aucune
        impression.
      </Alert>

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
                    minHeight: 280,
                    border: "2px dashed",
                    borderColor: isDragging ? "primary.main" : "divider",
                    borderRadius: 2,
                    bgcolor: isDragging ? "primary.light" : "#fbfcff",
                    display: "grid",
                    placeItems: "center",
                    p: 3,
                    textAlign: "center",
                    transition: "160ms ease",
                  }}
                >
                  <Stack spacing={2} alignItems="center">
                    <CloudUploadOutlinedIcon color="primary" sx={{ fontSize: 64 }} />
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
                    <Button variant="outlined" onClick={() => inputRef.current?.click()}>
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
                      <Typography variant="caption" color="text.secondary">
                        {(selectedFile.size / 1024).toFixed(1)} Ko
                      </Typography>
                    </Box>
                  </Stack>
                )}
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
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<PrintOutlinedIcon />}
                    disabled
                  >
                    Imprimer
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
                      bgcolor: "#eef2f8",
                      border: "1px solid",
                      borderColor: "divider",
                      display: "grid",
                      placeItems: "center",
                      p: 3,
                      textAlign: "center",
                    }}
                  >
                    <Stack spacing={1.5} alignItems="center">
                      <PictureAsPdfOutlinedIcon color="secondary" sx={{ fontSize: 56 }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Aperçu indisponible
                      </Typography>
                      <Typography color="text.secondary">
                        Le rendu PDF sera branché dans une prochaine itération.
                      </Typography>
                    </Stack>
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
