// src/pages/projetos/ProjetosLista.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Ellipsis, Search, ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import useAxios from "../../utils/useAxios";
import Swal from "sweetalert2";

// Componente de paginação simples e elegante
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

            {/* Números das páginas */}
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

function ProjetosLista() {
    const api = useAxios();
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [openProjMenuId, setOpenProjMenuId] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 16;

    useEffect(() => {
        const fetchProjetos = async () => {
            try {
                const { data } = await api.get("/projetos/");
                setProjetos(data || []);
            } catch (error) {
                console.error("Erro ao carregar projetos:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchProjetos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ordena por updated_at / created_at (mais recentes primeiro)
    const sortedProjects = useMemo(() => {
        return [...projetos].sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
        });
    }, [projetos]);

    // Filtro de busca
    const filteredProjects = useMemo(() => {
        if (!searchTerm.trim()) return sortedProjects;

        const q = searchTerm.toLowerCase();

        return sortedProjects.filter((p) => {
            const nome = p.name || "";
            const responsavel = p.owner_nome || p.owner_email || "";
            const mun = p.municipio || "";
            const uf = p.uf || "";

            return (
                nome.toLowerCase().includes(q) ||
                responsavel.toLowerCase().includes(q) ||
                mun.toLowerCase().includes(q) ||
                uf.toLowerCase().includes(q)
            );
        });
    }, [sortedProjects, searchTerm]);

    // Paginação
    const totalItems = filteredProjects.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const startIdx = (safeCurrentPage - 1) * pageSize;
    const visibleProjects = filteredProjects.slice(
        startIdx,
        startIdx + pageSize
    );

    if (loading) {
        return (
            <div className="w-full mt-10 flex justify-center">
                <p>Carregando projetos...</p>
            </div>
        );
    }

    return (
        <div className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <p className="pt-2 text-2xl font-bold">Todos os projetos</p>
                    <p className="text-sm text-gray-500">
                        Mostrando {visibleProjects.length} de {totalItems} projetos
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
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Search className="w-4 h-4 text-gray-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar por nome, responsável ou cidade..."
                            className="w-full border border-gray-300 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BBF2] focus:border-transparent"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* GRID DE PROJETOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
                {visibleProjects.map((proj) => (
                    <div
                        key={proj.id}
                        className="relative shadow-md p-5 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition transform bg-white flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                                        Projeto #{proj.id}
                                    </span>
                                </div>

                                {/* menu 3 pontinhos */}
                                <button
                                    type="button"
                                    className="p-1 rounded hover:bg-gray-100"
                                    onClick={() =>
                                        setOpenProjMenuId((prev) =>
                                            prev === proj.id ? null : proj.id
                                        )
                                    }
                                >
                                    <Ellipsis className="w-5 h-5 text-gray-400" />
                                </button>

                                {openProjMenuId === proj.id && (
                                    <div className="absolute right-3 top-10 bg-white border rounded shadow-md z-20 text-sm">
                                        {/* Editar */}
                                        <Link
                                            to={`/estudo/${proj.id}`}
                                            className="block px-4 py-2 hover:bg-gray-100"
                                            onClick={() => setOpenProjMenuId(null)}
                                        >
                                            Editar
                                        </Link>

                                        {/* Excluir */}
                                        <button
                                            type="button"
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                                            onClick={async () => {
                                                setOpenProjMenuId(null);

                                                const result = await Swal.fire({
                                                    title: "Excluir projeto?",
                                                    text: `Tem certeza que deseja excluir o projeto "${proj.name || "sem nome"
                                                        }"?`,
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
                                                        `/projetos/${proj.id}/`
                                                    );
                                                    setProjetos((prev) =>
                                                        prev.filter(
                                                            (p) => p.id !== proj.id
                                                        )
                                                    );
                                                    await Swal.fire({
                                                        title: "Excluído!",
                                                        text: "O projeto foi removido com sucesso.",
                                                        icon: "success",
                                                        confirmButtonColor: "#16a34a",
                                                    });
                                                } catch (error) {
                                                    console.error(
                                                        "Erro ao excluir projeto:",
                                                        error
                                                    );
                                                    await Swal.fire({
                                                        title: "Erro",
                                                        text: "Não foi possível excluir o projeto. Tente novamente.",
                                                        icon: "error",
                                                        confirmButtonColor: "#ef4444",
                                                    });
                                                }
                                            }}
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Título */}
                            <Link
                                to={`/estudo/${proj.id}`}
                                className="font-bold text-lg mt-3 line-clamp-2 text-[#00BBF2] hover:underline"
                            >
                                {proj.name || "Nome do Estudo"}
                            </Link>

                            {/* Descrição (opcional) */}
                            {proj.description && (
                                <p className="mt-2 text-xs text-gray-500 line-clamp-3">
                                    {proj.description}
                                </p>
                            )}

                            {/* Infos adicionais */}
                            <div className="mt-4 space-y-1 text-sm">
                                <div>
                                    <h5 className="font-semibold text-gray-700">
                                        Responsável
                                    </h5>
                                    <p className="text-gray-700">
                                        {proj.owner_nome ||
                                            proj.owner_email ||
                                            "—"}
                                    </p>
                                </div>

                                <div className="mt-2">
                                    <h5 className="font-semibold text-gray-700">
                                        Localidade
                                    </h5>
                                    <p className="text-gray-700">
                                        {proj.municipio && proj.uf
                                            ? `${proj.municipio}/${proj.uf}`
                                            : "—"}
                                    </p>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            Criado em
                                        </h5>
                                        <p className="text-gray-700">
                                            {proj.created_at
                                                ? proj.created_at
                                                    .slice(0, 10)
                                                    .split("-")
                                                    .reverse()
                                                    .join("/")
                                                : "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-gray-700">
                                            Última atualização
                                        </h5>
                                        <p className="text-gray-700">
                                            {proj.updated_at
                                                ? proj.updated_at
                                                    .slice(0, 10)
                                                    .split("-")
                                                    .reverse()
                                                    .join("/")
                                                : "—"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {visibleProjects.length === 0 && (
                    <p className="col-span-full text-gray-500 text-sm">
                        Nenhum projeto encontrado.
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

export default ProjetosLista;
