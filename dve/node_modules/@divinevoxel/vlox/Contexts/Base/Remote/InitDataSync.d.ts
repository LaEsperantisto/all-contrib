import { DataSyncData } from "./DataSync.types";
export default function InitDataSync(props: {
    onSync(data: DataSyncData): void;
}): void;
