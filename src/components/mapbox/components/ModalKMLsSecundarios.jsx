import { useState, useEffect } from "react";

export default function ModalKMLsSecundarios({ isOpen, onClose, onConfirm }) {
    const [name, setName] = useState("");
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (isOpen) {
            setName("");
            setFile(null);
            setError("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!name.trim()) return setError("Dê um nome para a camada.");
        if (!file) return setError("Selecione um arquivo .kml ou .kmz.");
        onConfirm({ name: name.trim(), file });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <h2 className="mb-3 text-lg font-semibold">Adicionar KML/KMZ Secundário</h2>

                <label className="mb-1 block text-sm font-medium">Nome da camada</label>
                <input
                    className="mb-3 w-full rounded border px-3 py-2"
                    placeholder="Ex.: Zoneamento, APP, ACP Carvão..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <label className="mb-1 block text-sm font-medium">Arquivo (.kml / .kmz)</label>
                <input
                    className="mb-3 w-full text-sm"
                    type="file"
                    accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                />

                {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

                <div className="mt-2 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded border px-3 py-1.5 text-gray-700 hover:bg-gray-100"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                    >
                        Adicionar
                    </button>
                </div>
            </div>
        </div>
    );
}
