import Link from "next/link";
import NodApp from "@/components/NodApp";

export default function Home() {
  return (
    <>
      <Link
        href="/onboarding-test"
        style={{
          position: "fixed",
          left: 22,
          bottom: 22,
          zIndex: 100,
          background: "#1c1917",
          color: "#fff",
          borderRadius: 9999,
          padding: "12px 18px",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          textDecoration: "none",
          boxShadow: "0 10px 26px rgba(0,0,0,.28)",
        }}
      >
        Onboarding Test →
      </Link>
      <NodApp />
    </>
  );
}
