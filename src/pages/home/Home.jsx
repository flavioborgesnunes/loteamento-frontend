import Header from "../../components/Header";
import Hero from "../../components/Hero";
import Features from "../../components/Features";
import Pricing from "../../components/Pricing";
import Footer from "../../components/Footer";

const Home = () => {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <Header />
            <main>
                <Hero />
                <Features />
                <Pricing />
            </main>
            <Footer />
        </div>
    );
};

export default Home;
