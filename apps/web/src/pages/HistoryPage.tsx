import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

export function HistoryPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Historique</Typography>
        <Typography color="text.secondary">
          Les impressions passées seront listées ici lorsque le module sera branché.
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ minHeight: 320, display: "grid", placeItems: "center" }}>
          <Stack spacing={1.5} alignItems="center" textAlign="center">
            <HistoryOutlinedIcon color="primary" sx={{ fontSize: 52 }} />
            <Typography variant="h6">Aucun historique disponible</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
              Cette page est prête pour recevoir la liste des bordereaux imprimés et leurs statuts.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
