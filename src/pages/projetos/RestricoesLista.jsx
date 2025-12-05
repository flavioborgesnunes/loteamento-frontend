// src/pages/projetos/RestricoesLista.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Ellipsis, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import useAxios from "../../utils/useAxios";
import Swal from "sweetalert2";

const GEOMAN_PATH = "/loteador";

// Componente de paginação (mesmo estilo da outra página)
function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

    return (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
            {/* Anterior */}
            <button
                type="button"
                className="flex items-center gap-1 px-3 py-1 text-xs sm:text-sm border rounded-full disabled:opacity-40 hover:bg-gray-50"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
            >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
            </button>

            {/* Números */}
            {pages.map((page) => (
                <button
                    key={page}
                    type="button"
                    onClick={() => onPageChange(page)}
                    className={`w-8 h-8 text-xs sm:text-sm flex items-center justify-center rounded-full border transition 
                        ${page === currentPage
                            ? "bg-[#00BBF2] text-white border-[#00BBF2]"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                >
                    {page}
                </button>
            ))}

            {/* Próxima */}
            <button
                type="button"
                className="flex items-center gap-1 px-3 py-1 text-xs sm:text-sm border rounded-full disabled:opacity-40 hover:bg-gray-50"
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
            >
                <span>Próxima</span>
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}

function RestricoesLista() {
    const api = useAxios();
    const navigate = useNavigate();

    const [restricoesList, setRestricoesList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [restricoesSearch, setRestricoesSearch] = useState("");
    const [openRestrMenuId, setOpenRestrMenuId] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 16;

    useEffect(() => {
        let isMounted = true;

        const fetchRestricoes = async () => {
            try {
                const { data } = await api.get("/restricoes/todas-do-dono/");
                const ordenadas = (data || []).sort((a, b) => {
                    const da = new Date(a.created_at || 0);
                    const db = new Date(b.created_at || 0);
                    return db - da;
                });
                if (isMounted) {
                    setRestricoesList(ordenadas);
                }
            } catch (e) {
                console.error("Erro ao carregar restrições:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchRestricoes();

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const restricoesFiltradas = useMemo(() => {
        const q = restricoesSearch.toLowerCase();
        return restricoesList.filter((r) => {
            const label = r.label || "";
            const project = r.project_name || "";
            const nome = r.created_by_nome || "";
            const email = r.created_by_email || "";
            return (
                label.toLowerCase().includes(q) ||
                project.toLowerCase().includes(q) ||
                nome.toLowerCase().includes(q) ||
                email.toLowerCase().includes(q)
            );
        });
    }, [restricoesList, restricoesSearch]);

    // Paginação
    const totalItems = restricoesFiltradas.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const startIdx = (safeCurrentPage - 1) * pageSize;
    const visibleRestricoes = restricoesFiltradas.slice(
        startIdx,
        startIdx + pageSize
    );

    if (loading) {
        return (
            <div className="w-full mt-10 flex justify-center">
                <p>Carregando restrições...</p>
            </div>
        );
    }

    return (
        <div className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <p className="pt-2 text-2xl font-bold">Todas as restrições</p>
                    <p className="text-sm text-gray-500">
                        Mostrando {visibleRestricoes.length} de {totalItems} versões
                    </p>
                    <Link
                        to="/projetos"
                        className="mt-1 inline-flex text-xs text-[#00BBF2] hover:underline"
                    >
                        ← Voltar para o painel
                    </Link>
                </div>

                <div className="flex items-center gap-2 max-w-sm w-full">
                    <div className="relative w-full">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar por rótulo, projeto ou responsável..."
                            className="w-full border border-gray-300 rounded-full pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BBF2] focus:border-transparent"
                            value={restricoesSearch}
                            onChange={(e) => {
                                setRestricoesSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* GRID DE RESTRIÇÕES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
                {visibleRestricoes.map((r) => (
                    <div
                        key={r.id}
                        className="relative shadow-md p-5 rounded-xl cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition transform bg-white flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex justify-between items-start gap-2">
                                <p className="bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl text-xs">
                                    v{r.version}
                                </p>

                                {/* menu 3 pontinhos */}
                                <button
                                    type="button"
                                    className="p-1 rounded hover:bg-gray-100"
                                    onClick={() =>
                                        setOpenRestrMenuId((prev) =>
                                            prev === r.id ? null : r.id
                                        )
                                    }
                                >
                                    <Ellipsis className="w-5 h-5 text-gray-400" />
                                </button>

                                {openRestrMenuId === r.id && (
                                    <div className="absolute right-3 top-10 bg-white border rounded shadow-md z-20 text-sm">
                                        <button
                                            type="button"
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                                            onClick={() => {
                                                setOpenRestrMenuId(null);
                                                navigate(
                                                    `${GEOMAN_PATH}?restricoesId=${r.id}`
                                                );
                                            }}
                                        >
                                            Editar
                                        </button>

                                        {/* Excluir */}
                                        <button
                                            type="button"
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setOpenRestrMenuId(null);

                                                const result = await Swal.fire({
                                                    title: "Excluir versão de restrições?",
                                                    text: `Tem certeza que deseja excluir a versão v${r.version}?`,
                                                    icon: "warning",
                                                    showCancelButton: true,
                                                    confirmButtonColor: "#d33",
                                                    cancelButtonColor: "#6b7280",
                                                    confirmButtonText: "Sim, excluir",
                                                    cancelButtonText: "Cancelar",
                                                });

                                                if (!result.isConfirmed) return;

                                                try {
                                                    await api.delete(
                                                        `/restricoes/${r.id}/`
                                                    );

                                                    setRestricoesList((prev) =>
                                                        prev.filter(
                                                            (item) => item.id !== r.id
                                                        )
                                                    );

                                                    Swal.fire(
                                                        "Excluída!",
                                                        "A versão de restrições foi removida.",
                                                        "success"
                                                    );
                                                } catch (err) {
                                                    console.error(
                                                        "[RestricoesLista] erro ao excluir:",
                                                        err
                                                    );
                                                    Swal.fire(
                                                        "Erro",
                                                        "Não foi possível excluir esta versão de restrições.",
                                                        "error"
                                                    );
                                                }
                                            }}
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Título / Label */}
                            <h4
                                className="font-bold text-lg mt-4 line-clamp-2 text-[#00BBF2] hover:underline"
                                onClick={() => {
                                    navigate(
                                        `${GEOMAN_PATH}?restricoesId=${r.id}`
                                    );
                                }}
                            >
                                {r.label
                                    ? `${r.label}`
                                    : `${r.project_name || "Projeto sem nome"}`}
                            </h4>

                            {/* Infos extras (usando fields da model) */}
                            <div className="mt-3 space-y-1 text-sm">
                                <div>
                                    <h5 className="font-semibold text-gray-700">
                                        Projeto
                                    </h5>
                                    <p className="text-gray-700">
                                        {r.project_name || "—"}
                                    </p>
                                </div>

                                <div className="mt-2">
                                    <h5 className="font-semibold text-gray-700">
                                        Responsável
                                    </h5>
                                    <p className="text-gray-700">
                                        {r.created_by_nome ||
                                            r.created_by_email ||
                                            "—"}
                                    </p>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            Criado em
                                        </h5>
                                        <p className="text-gray-700">
                                            {r.created_at
                                                ? r.created_at
                                                    .slice(0, 10)
                                                    .split("-")
                                                    .reverse()
                                                    .join("/")
                                                : "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            Fonte
                                        </h5>
                                        <p className="text-gray-700">
                                            {r.source || "—"}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            % permitido
                                        </h5>
                                        <p className="text-gray-700">
                                            {typeof r.percent_permitido ===
                                                "number"
                                                ? `${r.percent_permitido.toFixed(
                                                    1
                                                )}%`
                                                : "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            Corte %
                                        </h5>
                                        <p className="text-gray-700">
                                            {typeof r.corte_pct_cache ===
                                                "number"
                                                ? `${r.corte_pct_cache.toFixed(1)}%`
                                                : "—"}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-2 text-xs">
                                    <h5 className="font-semibold text-gray-700">
                                        Status
                                    </h5>
                                    <span
                                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.is_active
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-gray-100 text-gray-600 border border-gray-200"
                                            }`}
                                    >
                                        {r.is_active ? "Ativa" : "Inativa"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {visibleRestricoes.length === 0 && (
                    <p className="col-span-full text-gray-500 text-sm">
                        Nenhuma restrição encontrada.
                    </p>
                )}
            </div>

            {/* Paginação */}
            <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
            />
        </div>
    );
}

export default RestricoesLista;
