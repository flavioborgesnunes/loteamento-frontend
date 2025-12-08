import PricingCard from "./PricingCard";

const plans = [
  {
    name: "Plano Básico",
    originalPrice: 2500,
    price: 1999,
    users: 3,
    projects: 30,
    popular: false,
    features: [
      "Mapeamento de terrenos",
      "Gestão de vendas",
      "Relatórios básicos",
      "Suporte por email",
      "Acesso mobile",
    ],
  },
  {
    name: "Plano Pró",
    originalPrice: 4000,
    price: 2999,
    users: 6,
    projects: 80,
    popular: true,
    features: [
      "Tudo do plano Básico",
      "Análise com I.A.",
      "Relatórios avançados",
      "Integração CRM",
      "Suporte prioritário",
      "API de integração",
    ],
  },
  {
    name: "Plano Premium",
    originalPrice: 7000,
    price: 3799,
    users: 10,
    projects: 150,
    popular: false,
    features: [
      "Tudo do plano Pró",
      "I.A. preditiva",
      "White-label",
      "Gerente de conta",
      "SLA garantido",
      "Treinamento exclusivo",
      "Customizações",
    ],
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wider">
            Planos e Preços
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-2 mb-4">
            Escolha o plano ideal para seu negócio
          </h2>
          <p className="text-lg text-muted-foreground">
            Todos os planos incluem acesso completo à plataforma com faturamento
            anual. Economize até 20% comparado ao mensal.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {plans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>

        <p className="text-center text-muted-foreground mt-12">
          Todos os preços são em Reais (BRL). Impostos podem ser aplicados.
        </p>
      </div>
    </section>
  );
};

export default Pricing;
