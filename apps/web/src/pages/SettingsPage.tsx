import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/useAuth";

interface ClientMode {
  enabled: boolean;
  token: string;
  expiresAt: string | null;
}

export function SettingsPage() {
  const { token: authToken } = useAuth();
  const [mode, setMode] = useState<ClientMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3333";
  const clientUrl = mode
    ? `http://${window.location.hostname}:5173/client-print/${mode.token}`
    : "";

  const request = useCallback(
    async (path = "", method = "GET") => {
      if (!authToken) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/settings/client-mode${path}`, {
          method,
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) throw new Error("Impossible de modifier le mode client.");
        setMode((await response.json()) as ClientMode);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
      } finally {
        setBusy(false);
      }
    },
    [apiBaseUrl, authToken],
  );

  useEffect(() => {
    void request();
  }, [request]);

  async function copyUrl() {
    await navigator.clipboard.writeText(clientUrl);
    setMessage("URL copiée.");
    window.setTimeout(() => setMessage(null), 2000);
  }
  async function update(path: string, confirmation: string) {
    await request(path, "POST");
    setMessage(confirmation);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Paramètres
        </Typography>
        <Typography color="text.secondary">Configuration du poste d’expédition.</Typography>
      </Box>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          {!mode ? (
            <Box sx={{ minHeight: 180, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={3}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
                <Box>
                  <Typography variant="h5">Mode client</Typography>
                  <Typography color="text.secondary">
                    Contrôlez l’accès autonome depuis le QR code.
                  </Typography>
                </Box>
                <Chip
                  label={mode.enabled ? "Activé" : "Désactivé"}
                  color={mode.enabled ? "success" : "default"}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  color="success"
                  disabled={busy || mode.enabled}
                  onClick={() => void update("/enable", "Mode client activé.")}
                >
                  Activer
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={busy || !mode.enabled}
                  onClick={() => void update("/disable", "Mode client désactivé.")}
                >
                  Désactiver
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  disabled={busy}
                  onClick={() => void update("/regenerate-token", "QR Code régénéré.")}
                >
                  Régénérer le QR Code
                </Button>
              </Stack>
              <Box sx={{ p: 3, borderRadius: 2, bgcolor: "background.default" }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ md: "center" }}
                >
                  <Box
                    sx={{
                      width: 196,
                      height: 196,
                      borderRadius: 2,
                      bgcolor: "common.white",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      p: 1,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <QRCodeSVG value={clientUrl} size={176} level="M" marginSize={1} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ mb: 1 }}>
                      URL client sécurisée
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
                    <Button
                      variant="outlined"
                      startIcon={<PrintRoundedIcon />}
                      onClick={() => window.print()}
                      sx={{ mt: 1.5 }}
                    >
                      Imprimer le QR Code
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
      {mode && (
        <Box className="qr-print-sheet" aria-hidden="true">
          <Typography component="h1">Imprimez votre bordereau</Typography>
          <QRCodeSVG value={clientUrl} size={360} level="M" marginSize={2} />
          <Typography component="p">Scannez ce QR Code avec votre téléphone</Typography>
          <Typography component="small">{clientUrl}</Typography>
        </Box>
      )}
    </Stack>
  );
}
