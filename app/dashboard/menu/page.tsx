import { ListTree, UtensilsCrossed } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

// Menu: categories on the left, the dishes in the chosen category on the right.
// Layout only for now; menu editing is wired in during a later phase.

export default function MenuPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Menu"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Dishes, sizes, prices and what is sold out. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader title="Categories" />
          <EmptyState icon={<ListTree size={20} />} title="No data yet" message="Pizzas, sides, drinks and deals are listed here." />
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Items" />
          <EmptyState
            className="min-h-72"
            icon={<UtensilsCrossed size={20} />}
            title="No data yet"
            message="Each dish shows its sizes and prices, with a switch to mark it sold out."
          />
        </Card>
      </div>
    </div>
  );
}
