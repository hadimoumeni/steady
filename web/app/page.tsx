import { SteadyApp } from "@/components/SteadyApp";
import { SteadyErrorBoundary } from "@/components/SteadyErrorBoundary";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <SteadyErrorBoundary>
        <SteadyApp />
      </SteadyErrorBoundary>
    </main>
  );
}
