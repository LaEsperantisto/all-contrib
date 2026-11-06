import { TextureProcedure } from "./TextureProcedure";
export declare class TextureProcedureRegister {
    static procedures: Map<string, TextureProcedure<any>>;
    static register(id: string, procedure: TextureProcedure): void;
    static get(id: string): TextureProcedure<any>;
}
