import { SectionMesh } from "./SectionMesh";
import { Vec3Array } from "@amodx/math";
export declare class SectorMesh {
    sections: (SectionMesh | null)[];
    position: Vec3Array;
    dipose(): void;
    getSection(x: number, y: number, z: number): SectionMesh | null;
    addSection(x: number, y: number, z: number): SectionMesh;
    removeSection(x: number, y: number, z: number): false | SectionMesh;
}
