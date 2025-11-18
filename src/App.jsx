import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/auth/Login';
import RegisterCliente from './pages/auth/RegisterCliente';
import RegisterUsuario from './pages/auth/RegisterUsuario';
import RedefinirSenha from './pages/auth/RedefinirSenha';
import EsqueciSenha from './pages/auth/EsqueciSenha';
import Dashboard from './pages/dashboard/Dashboard';
import MainWrapper from './layout/mainWrapper';
import Home from './pages/home/Home';
import Projetos from './pages/projetos/Projetos';
import PerfilUsuario from './pages/auth/PerfilUsuario';
import EstudoMapa from './pages/estudo_mapa/EstudoMapa';
import VisualizarProjetos from './pages/visualizar/VisualizarProjetos';
import Parcelamento from './pages/parcelamento/Parcelamento'
import GeomanLoteador from './pages/geoman/GeomanLoteador';
import GerarQuarteirao from './pages/parcelamento/GerarQuarteirao';
import ParcelamentoIA from './pages/parcelamento/ParcelamentoIA';


function App() {
  return (
    <Router>
      <Routes>
        {/* Rotas públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/register-cliente" element={<RegisterCliente />} />
        <Route path="/create-new-password" element={<RedefinirSenha />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/" element={<Home />} />

        {/* Rotas protegidas (agrupadas) */}
        <Route element={<MainWrapper />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/register-usuario" element={<RegisterUsuario />} />
          <Route path="/estudo" element={<EstudoMapa />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/loteador" element={<GeomanLoteador />} />
          <Route path="/visualizar-projetos" element={<VisualizarProjetos />} />
          <Route path="/parcelamento" element={<Parcelamento />} />
          <Route path="/ia-parcelamento" element={<ParcelamentoIA />} />
          <Route path="/parcelamento/gerar-quarteirao" element={<GerarQuarteirao />} />
          <Route path="/settings" element={<PerfilUsuario />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
