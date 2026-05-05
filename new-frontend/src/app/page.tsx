import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import TrustPillars from "@/components/sections/TrustPillars";
import HowItWorks from "@/components/sections/HowItWorks";
import AgentGuard from "@/components/sections/AgentGuard";
import LiveDemo from "@/components/sections/LiveDemo";
import SocialProof from "@/components/sections/SocialProof";
import Pricing from "@/components/sections/Pricing";
import FinalCTA from "@/components/sections/FinalCTA";

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustPillars />
        <HowItWorks />
        <AgentGuard />
        <LiveDemo />
        <SocialProof />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
