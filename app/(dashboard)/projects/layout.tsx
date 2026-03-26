import Projects from "@/components/projectComponents/Projects"
import TopBanner from "@/components/projectComponents/TopBanner"

export default function EditorLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <section className="h-screen flex flex-col">
            <TopBanner />
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* <Projects /> */}
                <div className="flex-1 min-w-0 min-h-0">
                    {children}
                </div>
            </div>
        </section>
    )
}
