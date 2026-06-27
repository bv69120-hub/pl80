import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LocalPrintshopOutlinedIcon from "@mui/icons-material/LocalPrintshopOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { Box, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";

const dashboardMetrics = [
  {
    label: "Impressions du jour",
    value: "0",
    helper: "Aucune impression lancée",
    icon: <PrintOutlinedIcon color="primary" />,
  },
  {
    label: "Impressions en attente",
    value: "0",
    helper: "File d'attente vide",
    icon: <ScheduleOutlinedIcon color="primary" />,
  },
  {
    label: "Imprimante",
    value: "PL80E",
    helper: "Intégration prévue",
    icon: <LocalPrintshopOutlinedIcon color="primary" />,
  },
  {
    label: "Utilisateurs connectés",
    value: "1",
    helper: "Session opérateur active",
    icon: <GroupOutlinedIcon color="primary" />,
  },
];

export function DashboardPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Tableau de bord</Typography>
        <Typography color="text.secondary">
          Vue synthétique des impressions et de la disponibilité imprimante.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        {dashboardMetrics.map((metric) => (
          <Grid item xs={12} sm={6} lg={3} key={metric.label}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Stack spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "primary.light",
                    }}
                  >
                    {metric.icon}
                  </Box>
                  <Box>
                    <Typography variant="h5">{metric.value}</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{metric.label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {metric.helper}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent sx={{ minHeight: 220 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2.5}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
            sx={{ height: "100%" }}
          >
            <Box>
              <Typography variant="h6">File d'impression</Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 680 }}>
                Aucun bordereau n'est en cours de traitement. La V1 prépare l'interface pour la
                future intégration de la PL80E sans déclencher d'impression.
              </Typography>
            </Box>
            <Chip label="Impression désactivée" color="secondary" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
