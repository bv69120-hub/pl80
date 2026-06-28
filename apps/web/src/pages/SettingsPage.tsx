import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

export function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const clientUrl = "http://ADRESSE_IP_DU_PC:5173/client-print";
  async function copyUrl() {
    await navigator.clipboard.writeText(clientUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Paramètres
        </Typography>
        <Typography color="text.secondary">Configuration du poste d’expédition.</Typography>
      </Box>
      {copied && <Alert severity="success">URL copiée.</Alert>}
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: 2,
                bgcolor: "primary.light",
                color: "primary.main",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <QrCode2RoundedIcon sx={{ fontSize: 58 }} />
            </Box>
            <Box sx={{ flex: 1, width: "100%" }}>
              <Typography variant="h5">QR Code client</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Utilisez cette URL pour générer le QR code affiché aux clients. Remplacez l’adresse
                par l’IP locale de ce PC.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField fullWidth value={clientUrl} InputProps={{ readOnly: true }} />
                <Button
                  variant="contained"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={() => void copyUrl()}
                >
                  Copier
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
