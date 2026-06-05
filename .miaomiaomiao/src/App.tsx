import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Layout from "./components/Layout";
import PlayerBar from "./components/PlayerBar";
import Home from "./pages/Home";
import Characters from "./pages/Characters";
import CharacterDetail from "./pages/CharacterDetail";
import Bands from "./pages/Bands";
import BandDetail from "./pages/BandDetail";
import Cards from "./pages/Cards";
import Songs from "./pages/Songs";
import Events from "./pages/Events";
import Tools from "./pages/Tools";
import About from "./pages/About";

function AppRoutes() {
  const loc = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={loc.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Routes location={loc}>
          <Route path="/" element={<Home />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/characters/:id" element={<CharacterDetail />} />
          <Route path="/bands" element={<Bands />} />
          <Route path="/bands/:key" element={<BandDetail />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/songs" element={<Songs />} />
          <Route path="/events" element={<Events />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <AppRoutes />
        <PlayerBar />
      </Layout>
    </BrowserRouter>
  );
}
