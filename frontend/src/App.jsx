import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Finance from "./pages/Finance";
import Workouts from "./pages/Workouts";
import Projects from "./pages/Projects";
import Upskilling from "./pages/Upskilling";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="finance" element={<Finance />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="projects" element={<Projects />} />
          <Route path="upskilling" element={<Upskilling />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
