import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer id="contact" className="bg-foreground text-primary-foreground py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                Lotenet<span className="text-primary">.I.A.</span>
              </span>
            </Link>
            <p className="text-primary-foreground/70 max-w-md">
              A plataforma mais completa para gestão de loteamentos com
              inteligência artificial. Transforme seu negócio imobiliário.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Produto</h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-primary-foreground/70 hover:text-primary transition-colors">
                  Recursos
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-primary-foreground/70 hover:text-primary transition-colors">
                  Planos
                </a>
              </li>
              <li>
                <a href="#" className="text-primary-foreground/70 hover:text-primary transition-colors">
                  Integrações
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Contato</h4>
            <ul className="space-y-2 text-primary-foreground/70">
              <li>contato@lotenet.ia</li>
              <li>(11) 99999-9999</li>
              <li>São Paulo, Brasil</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-12 pt-8 text-center text-primary-foreground/50">
          <p>© {new Date().getFullYear()} Lotenet.I.A. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
