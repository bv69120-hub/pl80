import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LocalPrintshopOutlinedIcon from "@mui/icons-material/LocalPrintshopOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

const drawerWidth = 264;
const navigationItems = [
  { label: "Tableau de bord", path: "/dashboard", icon: <DashboardOutlinedIcon /> },
  { label: "Nouveau bordereau", path: "/new-label", icon: <LocalPrintshopOutlinedIcon /> },
  { label: "Historique", path: "/history", icon: <HistoryOutlinedIcon /> },
  { label: "Paramètres", path: "/settings", icon: <SettingsOutlinedIcon /> },
];

function Brand() {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2.5, py: 2.5 }}>
      <Box
        sx={{
          width: 43,
          height: 43,
          borderRadius: 1.5,
          display: "grid",
          placeItems: "center",
          color: "common.white",
          bgcolor: "primary.main",
          fontWeight: 900,
          fontSize: 18,
          borderBottom: "6px solid",
          borderColor: "secondary.main",
        }}
      >
        BX
      </Box>
      <Box>
        <Typography sx={{ color: "primary.dark", fontWeight: 900, lineHeight: 1.1 }}>
          BV Expédition
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          PRO
        </Typography>
      </Box>
    </Stack>
  );
}

function PrinterStatus({ compact = false }: { compact?: boolean }) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{
        px: compact ? 1.25 : 2,
        py: 1,
        borderRadius: 2,
        bgcolor: "rgba(255,255,255,.12)",
        border: "1px solid rgba(255,255,255,.2)",
      }}
    >
      <Box
        sx={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          bgcolor: "success.main",
          boxShadow: "0 0 0 4px rgba(255,255,255,.13)",
        }}
      />
      <Box sx={{ display: { xs: compact ? "none" : "block", sm: "block" } }}>
        <Typography
          variant="caption"
          sx={{ color: "rgba(255,255,255,.72)", display: "block", lineHeight: 1 }}
        >
          Imprimante
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: "common.white", fontWeight: 800, lineHeight: 1.35 }}
        >
          PL80E · Prête
        </Typography>
      </Box>
    </Stack>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  return (
    <Stack sx={{ height: "100%", bgcolor: "common.white" }}>
      <Brand />
      <Divider />
      <Typography
        variant="overline"
        sx={{ px: 3, pt: 2.5, color: "text.secondary", fontWeight: 800 }}
      >
        Navigation
      </Typography>
      <List sx={{ flex: 1, px: 1.5, py: 1 }}>
        {navigationItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={item.path}
            onClick={onNavigate}
            selected={location.pathname === item.path}
            sx={{
              borderRadius: 2,
              mb: 0.75,
              py: 1.15,
              "&.Mui-selected": {
                bgcolor: "primary.main",
                color: "common.white",
                "&:hover": { bgcolor: "primary.dark" },
                "& .MuiListItemIcon-root": { color: "secondary.main" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 42 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
          <Avatar
            sx={{
              bgcolor: "primary.light",
              color: "primary.main",
              width: 38,
              height: 38,
              fontWeight: 800,
            }}
          >
            {user?.username.slice(0, 1).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" fontWeight={800} noWrap>
              {user?.username}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.role}
            </Typography>
          </Box>
        </Stack>
        <ListItemButton onClick={logout} sx={{ borderRadius: 2 }}>
          <ListItemIcon sx={{ minWidth: 42 }}>
            <LogoutOutlinedIcon />
          </ListItemIcon>
          <ListItemText primary="Déconnexion" />
        </ListItemButton>
      </Box>
    </Stack>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const navigate = useNavigate();
  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: "primary.main",
          width: { lg: `calc(100% - ${drawerWidth}px)` },
          ml: { lg: `${drawerWidth}px` },
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: { xs: 68, sm: 76 } }}>
          {!isDesktop && (
            <IconButton
              sx={{ color: "common.white" }}
              edge="start"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ color: "common.white", lineHeight: 1.1 }} noWrap>
              Espace expédition
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,.72)" }} noWrap>
              Vos bordereaux, prêts à partir
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<LocalPrintshopOutlinedIcon />}
            onClick={() => navigate("/new-label")}
            sx={{ display: { xs: "none", md: "inline-flex" } }}
          >
            Nouveau bordereau
          </Button>
          <PrinterStatus compact />
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            "& .MuiDrawer-paper": { width: drawerWidth },
          }}
        >
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", lg: "block" },
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
        >
          <SidebarContent />
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { lg: `calc(100% - ${drawerWidth}px)` },
          pt: { xs: 11, sm: 13 },
          px: { xs: 2, sm: 3, md: 4 },
          pb: 5,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
