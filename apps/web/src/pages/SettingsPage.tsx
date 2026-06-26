import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

export function SettingsPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Paramètres</Typography>
        <Typography color="text.secondary">
          Configuration de l'application et des imprimantes à venir.
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ minHeight: 320, display: "grid", placeItems: "center" }}>
          <Stack spacing={1.5} alignItems="center" textAlign="center">
            <SettingsOutlinedIcon color="primary" sx={{ fontSize: 52 }} />
            <Typography variant="h6">Paramètres non configurés</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
              Les options utilisateur, imprimantes et préférences seront ajoutées dans les prochains
              tickets.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
