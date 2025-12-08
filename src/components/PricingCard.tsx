import { Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

interface PricingCardProps {
  name: string;
  originalPrice: number;
  price: number;
  users: number;
  projects: number;
  popular?: boolean;
  features: string[];
}

const PricingCard = ({
  name,
  originalPrice,
  price,
  users,
  projects,
  popular = false,
  features,
}: PricingCardProps) => {
  const discount = Math.round(((originalPrice - price) / originalPrice) * 100);

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
        popular
          ? "border-primary shadow-lg scale-105 z-10"
          : "border-border"
      )}
    >
      {popular && (
        <div className="absolute top-0 right-0">
          <Badge className="rounded-none rounded-bl-lg px-4 py-1 font-semibold">
            Mais Popular
          </Badge>
        </div>
      )}

      <CardHeader className="pb-4">
        <h3 className="text-2xl font-bold text-foreground">{name}</h3>
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground line-through">
              R$ {originalPrice.toLocaleString("pt-BR")}
            </span>
            <Badge variant="secondary" className="text-xs">
              -{discount}%
            </Badge>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-4xl font-bold text-foreground">
              R$ {price.toLocaleString("pt-BR")}
            </span>
            <span className="text-muted-foreground">/mês</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Faturado anualmente
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-bold text-accent-foreground">
                {users}
              </span>
            </div>
            <span className="text-foreground">
              Até {users} usuários
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-bold text-accent-foreground">
                {projects}
              </span>
            </div>
            <span className="text-foreground">{projects} projetos</span>
          </div>
        </div>

        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          className={cn(
            "w-full font-semibold py-6",
            popular ? "" : "bg-secondary hover:bg-secondary/90"
          )}
          variant={popular ? "default" : "secondary"}
        >
          Assinar Agora
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PricingCard;
