import Projects from "./_components/Projects"
import TopBanner from "./_components/TopBanner"

export default function EditorLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <section className="h-screen flex flex-col">
            <TopBanner />
            <div className="flex flex-1 overflow-hidden">
                <Projects />
                {children}
            </div>
        </section>
    )
}
