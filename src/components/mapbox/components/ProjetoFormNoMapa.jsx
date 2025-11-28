import { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function ProjetoFormNoMapa({ defaultUF = "", defaultMunicipio = "", onSubmit }) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [uf, setUf] = useState("");
    const [municipio, setMunicipio] = useState("");

    const [busy, setBusy] = useState(false);

    useEffect(() => {
        // sincroniza defaultUF quando mudar no pai
        if (defaultUF && defaultUF.length === 2) {
            setUf(defaultUF.toUpperCase());
        }
    }, [defaultUF]);

    // ⬇️ NOVO: sincroniza município escolhido no mapa
    useEffect(() => {
        if (defaultMunicipio) {
            setMunicipio(defaultMunicipio);
        }
    }, [defaultMunicipio]);

    async function handleSubmit(e) {
        e.preventDefault();
        const trimmedName = name.trim();
        const trimmedDesc = description.trim();
        const ufUp = (uf || "").toUpperCase();
        const municipioTrim = municipio.trim();

        if (!trimmedName) {
            Swal.fire({
                icon: "warning",
                title: "Atenção",
                text: "Informe um nome para o projeto.",
            });
            return;
        }
        if (!ufUp || ufUp.length !== 2) {
            Swal.fire({
                icon: "warning",
                title: "UF Inválida",
                text: "Informe a UF com 2 letras (ex.: SC).",
            });
            return;
        }

        try {
            setBusy(true);
            await Promise.resolve(
                onSubmit?.({
                    name: trimmedName,
                    description: trimmedDesc,
                    uf: ufUp,
                    municipio: municipioTrim || null,
                })
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="w-full max-w-xl bg-white/90 backdrop-blur rounded-xl shadow p-4 space-y-3"
        >
            <h3 className="text-base font-semibold">Criar/Salvar Projeto</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-sm text-gray-700">Nome do projeto *</span>
                    <input
                        className="border rounded px-3 py-2 text-sm"
                        placeholder="Ex.: Loteamento Santa Clara"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={200}
                        required
                    />
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-sm text-gray-700">UF *</span>
                    <input
                        className="border rounded px-3 py-2 text-sm"
                        placeholder="SC"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                        required
                    />
                </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-sm text-gray-700">Município (opcional)</span>
                    <input
                        className="border rounded px-3 py-2 text-sm"
                        placeholder="Ex.: Florianópolis"
                        value={municipio}
                        onChange={(e) => setMunicipio(e.target.value)}
                        maxLength={150}
                    />
                </label>
            </div>

            <label className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Descrição (opcional)</span>
                <textarea
                    className="border rounded px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Notas, observações…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                />
            </label>

            <div className="flex items-center justify-end gap-2">
                <button
                    type="submit"
                    disabled={busy}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm px-4 py-2 rounded"
                >
                    {busy ? "Salvando…" : "Salvar & Exportar KMZ"}
                </button>
            </div>
        </form>
    );
}
