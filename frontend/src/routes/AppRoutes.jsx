import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Signup from "../pages/Signup";
import Login from "../pages/Login";
import Welcome from "../pages/Welcome";
import NewChat from "../pages/NewChat";
import Chat from "../pages/Chat";
import AppLayout from "../components/AppLayout";

function RequireAuth() {
  const token = localStorage.getItem("access_token");
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Welcome />} />
          <Route path="/new-chat" element={<NewChat />} />
          <Route path="/conversations/:id" element={<Chat />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
