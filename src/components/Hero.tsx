import { Button } from "../components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import heroImage from "../assets/hero-loteamento.jpg";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Vista aérea de loteamento moderno"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/40" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-primary/20 backdrop-blur-sm border border-primary/30 rounded-full px-4 py-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-primary-foreground font-medium">
              Inteligência Artificial para Loteamentos
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6 leading-tight">
            Transforme seu{" "}
            <span className="text-primary">loteamento</span> com
            Inteligência Artificial
          </h1>

          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl">
            Gerencie projetos, mapeie terrenos e otimize suas vendas com a
            plataforma mais completa do mercado imobiliário.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="text-lg px-8 py-6 font-semibold group">
              Começar Agora
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 font-semibold bg-background/10 border-primary-foreground/20 text-primary-foreground hover:bg-background/20"
            >
              <Play className="mr-2 w-5 h-5" />
              Ver Demo
            </Button>
          </div>

          <div className="mt-12 flex items-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-foreground">500+</p>
              <p className="text-sm text-primary-foreground/70">Empresas</p>
            </div>
            <div className="w-px h-12 bg-primary-foreground/20" />
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-foreground">10k+</p>
              <p className="text-sm text-primary-foreground/70">Projetos</p>
            </div>
            <div className="w-px h-12 bg-primary-foreground/20" />
            <div className="text-center">
              <p className="text-3xl font-bold text-primary-foreground">99%</p>
              <p className="text-sm text-primary-foreground/70">Satisfação</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
