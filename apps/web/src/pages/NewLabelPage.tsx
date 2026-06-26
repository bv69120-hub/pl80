import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
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
  Typography,
} from "@mui/material";
import { ChangeEvent, DragEvent, useRef, useState } from "react";

export function NewLabelPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copies, setCopies] = useState(1);
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
          Préparez un fichier PDF et choisissez le nombre de copies à imprimer.
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
                  <FormControl fullWidth>
                    <InputLabel id="copies-label">Nombre de copies</InputLabel>
                    <Select
                      labelId="copies-label"
                      label="Nombre de copies"
                      value={copies}
                      onChange={(event) => setCopies(Number(event.target.value))}
                    >
                      {[1, 2, 3, 4, 5].map((copyCount) => (
                        <MenuItem key={copyCount} value={copyCount}>
                          {copyCount}
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
