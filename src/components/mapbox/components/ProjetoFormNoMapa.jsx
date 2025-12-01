import { useEffect, useState } from "react";
import Swal from "sweetalert2";

export default function ProjetoFormNoMapa({
    defaultName = "",
    defaultDescription = "",
    defaultUF = "",
    defaultMunicipio = "",
    onSalvar,
    onExportar,
}) {
    const [name, setName] = useState(defaultName);
    const [description, setDescription] = useState(defaultDescription);
    const [uf, setUf] = useState(defaultUF || "");
    const [municipio, setMunicipio] = useState(defaultMunicipio || "");
    const [busy, setBusy] = useState(false);

    // Sincroniza quando o MapBoxComponent mudar os defaults
    useEffect(() => {
        setName(defaultName || "");
    }, [defaultName]);

    useEffect(() => {
        setDescription(defaultDescription || "");
    }, [defaultDescription]);

    useEffect(() => {
        if (defaultUF && defaultUF.length === 2) {
            setUf(defaultUF.toUpperCase());
        }
    }, [defaultUF]);

    useEffect(() => {
        if (defaultMunicipio) {
            setMunicipio(defaultMunicipio);
        }
    }, [defaultMunicipio]);

    const payload = {
        name: name?.trim(),
        description: description?.trim(),
        uf: uf?.trim().toUpperCase(),
        municipio: municipio?.trim(),
    };

    async function handleSalvarClick(e) {
        e.preventDefault();
        if (!onSalvar) return;

        if (!payload.name) {
            Swal.fire({
                icon: "warning",
                title: "Informe um nome",
                text: "Dê um nome para o projeto antes de salvar.",
            });
            return;
        }

        try {
            setBusy(true);
            await onSalvar(payload);
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: "Erro ao salvar",
                text: "Não foi possível salvar o projeto.",
            });
        } finally {
            setBusy(false);
        }
    }

    async function handleExportarClick(e) {
        e.preventDefault();
        if (!onExportar) return;

        if (!payload.name) {
            Swal.fire({
                icon: "warning",
                title: "Informe um nome",
                text: "Dê um nome para o projeto antes de exportar.",
            });
            return;
        }

        try {
            setBusy(true);
            await onExportar(payload);
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: "Erro ao exportar",
                text: "Não foi possível exportar o KML/KMZ.",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="bg-white/90 backdrop-blur rounded-lg shadow p-4 flex flex-col gap-2 max-w-xl">
            <div className="flex gap-2">
                <div className="flex-1">
                    <label className="block text-xs font-semibold mb-1">
                        Nome do projeto
                    </label>
                    <input
                        type="text"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Loteamento Jardim das Árvores"
                    />
                </div>
                <div className="w-20">
                    <label className="block text-xs font-semibold mb-1">UF</label>
                    <input
                        type="text"
                        className="w-full border rounded px-2 py-1 text-sm uppercase"
                        maxLength={2}
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase())}
                        placeholder="UF"
                    />
                </div>
            </div>

            <div className="flex gap-2">
                <div className="flex-1">
                    <label className="block text-xs font-semibold mb-1">
                        Município
                    </label>
                    <input
                        type="text"
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={municipio}
                        onChange={(e) => setMunicipio(e.target.value)}
                        placeholder="Município"
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold mb-1">
                    Descrição
                </label>
                <textarea
                    className="w-full border rounded px-2 py-1 text-sm min-h-[60px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descrição ou observações do projeto..."
                />
            </div>

            <div className="mt-2 flex flex-wrap gap-2 justify-end">
                <button
                    type="button"
                    onClick={handleSalvarClick}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                    {busy ? "Salvando..." : "Salvar projeto"}
                </button>

                <button
                    type="button"
                    onClick={handleExportarClick}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {busy ? "Exportando..." : "Exportar KML/KMZ"}
                </button>
            </div>
        </form>
    );
}
