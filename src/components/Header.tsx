import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { MapPin } from "lucide-react";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gray-200 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <MapPin className="w-10 h-10 text-white bg-green-600 p-2 rounded-md" />
          </div>
          <span className="text-black">
            Lotenet<span className="text-green-500">.I.A.</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-gray-950 hover:text-gray-800">
            Recursos
          </a>
          <a href="#pricing" className="text-gray-950 hover:text-gray-800">
            Planos
          </a>
          <a href="#contact" className="text-gray-950 hover:text-gray-800">
            Contato
          </a>
        </nav>

        <Link to="/dashboard">
          <Button variant="default" className="font-semibold bg-green-600">
            Entrar
          </Button>
        </Link>
      </div>
    </header>
  );
};

export default Header;
