import { prisma } from "@/lib/prisma"
import { getUser } from "@/lib/auth-session"
import { notFound } from "next/navigation"
import SceneCanvas from "./SceneCanvas"
import { YjsProvider } from "@/lib/yjs/provider"

export default async function CanvasPage({
    params,
}: {
    params: Promise<{ projectId: string; sceneId: string }>
}) {
    const user = await getUser()
    if (!user) notFound()

    const { projectId, sceneId } = await params

    const scene = await prisma.scene.findFirst({
        where: { id: sceneId, projectId, userId: user.id },
    })

    if (!scene) notFound()

    return (
        <YjsProvider sceneId={sceneId}>
            <SceneCanvas sceneName={scene.name} />
        </YjsProvider>
    )
}
