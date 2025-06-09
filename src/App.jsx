import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/auth/Login';
import RegisterCliente from './pages/auth/RegisterCliente';
import RegisterUsuario from './pages/auth/RegisterUsuario';
import RedefinirSenha from './pages/auth/RedefinirSenha';
import EsqueciSenha from './pages/auth/EsqueciSenha';
import Dashboard from './pages/dashboard/Dashboard';
import MainWrapper from './layout/mainWrapper';
import Home from './pages/home/Home';

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
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
