import { CompiledTexture } from "../Classes/CompiledTexture";
import { TextureData } from "../../Textures/Texture.types";
import { WorkItemProgress } from "../../Util/WorkItemProgress";
export type BuildTextureDataProps = {
    type: string;
    baseURL?: string;
    createCache?: boolean;
    textures: TextureData[];
    finalSize?: [width: number, height: number];
};
export declare function BuildTextureData({ type, baseURL, textures, finalSize, createCache }: BuildTextureDataProps, progress: WorkItemProgress): Promise<CompiledTexture>;
