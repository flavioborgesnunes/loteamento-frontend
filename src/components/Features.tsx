import { MapPin, BarChart3, Users, Zap, Shield, Smartphone } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";

const features = [
  {
    icon: MapPin,
    title: "Mapeamento Inteligente",
    description:
      "Visualize e gerencie lotes com mapas interativos e dados geoespaciais em tempo real.",
  },
  {
    icon: BarChart3,
    title: "Análise com I.A.",
    description:
      "Previsões de vendas e insights de mercado usando inteligência artificial avançada.",
  },
  {
    icon: Users,
    title: "Gestão de Equipe",
    description:
      "Colabore com sua equipe e controle permissões de acesso por projeto.",
  },
  {
    icon: Zap,
    title: "Automação de Processos",
    description:
      "Automatize tarefas repetitivas e agilize o fluxo de vendas do seu loteamento.",
  },
  {
    icon: Shield,
    title: "Segurança Total",
    description:
      "Dados criptografados e backup automático para proteger suas informações.",
  },
  {
    icon: Smartphone,
    title: "Acesso Mobile",
    description:
      "Acesse a plataforma de qualquer lugar com nosso app responsivo.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Recursos
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Tudo que você precisa para gerenciar loteamentos
          </h2>
          <p className="text-lg text-muted-foreground">
            Nossa plataforma oferece ferramentas completas para modernizar a
            gestão do seu empreendimento imobiliário.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border"
            >
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                  <feature.icon className="w-6 h-6 text-accent-foreground group-hover:text-primary-foreground transition-colors" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
