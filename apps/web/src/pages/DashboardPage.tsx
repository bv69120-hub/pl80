import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import PrintDisabledOutlinedIcon from "@mui/icons-material/PrintDisabledOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";

const emptyMetrics = [
  {
    label: "Bordereaux du jour",
    value: "0",
    icon: <AssignmentTurnedInOutlinedIcon color="primary" />,
  },
  {
    label: "Impressions en attente",
    value: "0",
    icon: <ScheduleOutlinedIcon color="primary" />,
  },
  {
    label: "Erreurs d'impression",
    value: "0",
    icon: <PrintDisabledOutlinedIcon color="secondary" />,
  },
];

export function DashboardPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Tableau de bord</Typography>
        <Typography color="text.secondary">
          Vue synthétique prête à recevoir les futurs indicateurs métier.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        {emptyMetrics.map((metric) => (
          <Grid item xs={12} md={4} key={metric.label}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
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
                    <Typography color="text.secondary">{metric.label}</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card>
        <CardContent sx={{ minHeight: 220, display: "grid", placeItems: "center" }}>
          <Box textAlign="center">
            <Typography variant="h6">Aucune activité pour le moment</Typography>
            <Typography color="text.secondary">
              Les prochains bordereaux et impressions apparaîtront ici.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
