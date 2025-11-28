import React, { useEffect, useState, useMemo } from 'react';
import { Ellipsis, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import useAxios from '../../utils/useAxios';
import { useAuthStore } from '../../store/auth';
import Swal from 'sweetalert2';

import NovoEstudo from './images/projeto-novo-estudo.png';

function Projetos() {
    const api = useAxios();
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const user = useAuthStore((state) => state.allUserData);

    const [restricoesList, setRestricoesList] = useState([]);
    const [restricoesSearch, setRestricoesSearch] = useState("");

    const [openProjMenuId, setOpenProjMenuId] = useState(null);
    const [openRestrMenuId, setOpenRestrMenuId] = useState(null);

    // ==== FILTRO DE RESTRIÇÕES ====
    const restricoesFiltradas = useMemo(() => {
        const q = restricoesSearch.toLowerCase();
        return restricoesList.filter((r) =>
            (r.label || "").toLowerCase().includes(q) ||
            (r.project_name || "").toLowerCase().includes(q) ||
            (r.created_by_nome || "").toLowerCase().includes(q) ||
            (r.created_by_email || "").toLowerCase().includes(q)
        );
    }, [restricoesList, restricoesSearch]);

    // Só mostra 10 restrições
    const visibleRestricoes = useMemo(
        () => restricoesFiltradas.slice(0, 10),
        [restricoesFiltradas]
    );

    // ==== CARREGA PROJETOS ====
    useEffect(() => {
        const fetchProjetos = async () => {
            try {
                const { data } = await api.get('/projetos/');
                setProjetos(data || []);
            } catch (error) {
                console.error('Erro ao carregar projetos:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchProjetos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // sem dependências pra não ficar em loop

    // ==== CARREGA TODAS AS RESTRIÇÕES DO DONO ====
    useEffect(() => {
        let isMounted = true;

        const fetchRestricoes = async () => {
            try {
                const { data } = await api.get("/restricoes/todas-do-dono/");
                const ordenadas = (data || []).sort((a, b) => {
                    const da = new Date(a.created_at || 0);
                    const db = new Date(b.created_at || 0);
                    return db - da; // mais recentes primeiro
                });
                if (isMounted) {
                    setRestricoesList(ordenadas);
                }
            } catch (e) {
                console.error("Erro ao carregar restrições:", e);
            }
        };

        fetchRestricoes();

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // sem dependências

    // ==== ORDENA E FILTRA PROJETOS ====
    const sortedProjects = useMemo(() => {
        return [...projetos].sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA; // mais recentes primeiro
        });
    }, [projetos]);

    const filteredProjects = useMemo(() => {
        if (!searchTerm.trim()) return sortedProjects;

        const q = searchTerm.toLowerCase();

        return sortedProjects.filter((p) => {
            const nome = p.name || '';
            const responsavel = p.owner_nome || p.owner_email || '';
            const mun = p.municipio || '';
            const uf = p.uf || '';

            return (
                nome.toLowerCase().includes(q) ||
                responsavel.toLowerCase().includes(q) ||
                mun.toLowerCase().includes(q) ||
                uf.toLowerCase().includes(q)
            );
        });
    }, [sortedProjects, searchTerm]);

    // Só mostra os 9 primeiros projetos
    const visibleProjects = filteredProjects.slice(0, 9);

    if (loading) return <p>Carregando...</p>;

    return (
        <div className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">

            {/* ===================== CABEÇALHO PROJETOS ===================== */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <p className="pt-2 text-2xl font-bold">Projetos</p>
                    <p className="text-sm text-gray-500">
                        Mostrando {visibleProjects.length} de {projetos.length} projetos
                    </p>
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
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ===================== GRID DE PROJETOS ===================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-5">

                {/* Card: criar novo estudo */}
                <Link
                    to="/projetos/novo"
                    className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl hover:border-[#00BBF2] hover:bg-[#00BBF2]/5 transition p-4 min-h-[220px]"
                >
                    <img src={NovoEstudo} className="w-full max-h-32 object-contain" />
                    <p className="text-[#00BBF2] font-bold mt-3 text-center">
                        Novo Estudo
                    </p>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                        Crie um novo projeto de loteamento
                    </p>
                </Link>

                {/* Lista de projetos reais */}
                {visibleProjects.map((proj) => (
                    <div
                        key={proj.id}
                        className="relative shadow-md p-5 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition transform bg-white flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex justify-between items-center">
                                <p className="bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl text-xs">
                                    Em aprovação
                                </p>

                                {/* 3 pontinhos */}
                                <button
                                    type="button"
                                    className="p-1 rounded hover:bg-gray-100"
                                    onClick={() =>
                                        setOpenProjMenuId(prev => prev === proj.id ? null : proj.id)
                                    }
                                >
                                    <Ellipsis className="w-5 h-5 text-gray-400" />
                                </button>

                                {/* Dropdown PROJETOS */}
                                {openProjMenuId === proj.id && (
                                    <div className="absolute right-3 top-10 bg-white border rounded shadow-md z-20 text-sm">
                                        {/* Editar */}
                                        <Link
                                            to={`/projetos/${proj.id}`}
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
                                                    title: 'Excluir projeto?',
                                                    text: `Tem certeza que deseja excluir o projeto "${proj.name || 'sem nome'}"?`,
                                                    icon: 'warning',
                                                    showCancelButton: true,
                                                    confirmButtonColor: '#d33',
                                                    cancelButtonColor: '#6b7280',
                                                    confirmButtonText: 'Sim, excluir',
                                                    cancelButtonText: 'Cancelar',
                                                });
                                                if (result.isConfirmed) {
                                                    // Aqui depois você integra com o DELETE no backend
                                                    Swal.fire('Excluído!', 'Em breve conectamos com o backend.', 'success');
                                                }
                                            }}
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col">
                                {/* Só o título é link */}
                                <Link
                                    to={`/projetos/${proj.id}`}
                                    className="font-bold text-lg mt-4 line-clamp-2 text-[#00BBF2] hover:underline"
                                >
                                    {proj.name || 'Nome do Estudo'}
                                </Link>

                                <div className="mt-3 space-y-1 text-sm">
                                    <div>
                                        <h5 className="font-semibold text-gray-700">Responsável</h5>
                                        <p className="text-gray-700">
                                            {proj.owner_nome || proj.dono_nome || '—'}
                                        </p>
                                    </div>

                                    <div className="mt-2">
                                        <h5 className="font-semibold text-gray-700">Localidade</h5>
                                        <p className="text-gray-700">
                                            {proj.municipio && proj.uf
                                                ? `${proj.municipio}/${proj.uf}`
                                                : '—'}
                                        </p>
                                    </div>

                                    <div className="mt-2">
                                        <h5 className="font-semibold text-gray-700">
                                            Última atualização
                                        </h5>
                                        <p className="text-gray-700">
                                            {proj.updated_at
                                                ? proj.updated_at
                                                    .slice(0, 10)
                                                    .split('-')
                                                    .reverse()
                                                    .join('/')
                                                : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {visibleProjects.length === 0 && (
                    <p className="col-span-full text-gray-500 text-sm">
                        Nenhum projeto encontrado para &quot;{searchTerm}&quot;.
                    </p>
                )}
            </div>

            {/* ===================== SEÇÃO DE RESTRIÇÕES ===================== */}
            <div className="mt-10 shadow-md bg-white rounded-2xl p-5 w-full">

                {/* Cabeçalho + Busca */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <p className="pt-2 text-2xl font-bold">Restrições</p>
                        <p className="text-sm text-gray-500">
                            Mostrando {visibleRestricoes.length} de {restricoesFiltradas.length} versões
                        </p>
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
                                onChange={(e) => setRestricoesSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* GRID DE RESTRIÇÕES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-5">

                    {visibleRestricoes.map((r) => (
                        <div
                            key={r.id}
                            className="relative shadow-md p-5 rounded-xl cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition transform bg-white flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex justify-between items-center">
                                    <p className="bg-[#00BBF2] text-white font-bold py-0.5 px-4 rounded-2xl text-xs">
                                        v{r.version}
                                    </p>

                                    {/* 3 pontinhos */}
                                    <button
                                        type="button"
                                        className="p-1 rounded hover:bg-gray-100"
                                        onClick={() =>
                                            setOpenRestrMenuId(prev => prev === r.id ? null : r.id)
                                        }
                                    >
                                        <Ellipsis className="w-5 h-5 text-gray-400" />
                                    </button>

                                    {/* Dropdown RESTRIÇÕES */}
                                    {openRestrMenuId === r.id && (
                                        <div className="absolute right-3 top-10 bg-white border rounded shadow-md z-20 text-sm">
                                            {/* Editar – por enquanto só alerta */}
                                            <button
                                                type="button"
                                                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                                                onClick={async () => {
                                                    setOpenRestrMenuId(null);
                                                    await Swal.fire({
                                                        title: 'Editar restrição',
                                                        text: 'Aqui você vai abrir a tela de edição dessa versão de restrições.',
                                                        icon: 'info',
                                                        confirmButtonColor: '#16a34a',
                                                        confirmButtonText: 'OK',
                                                    });
                                                }}
                                            >
                                                Editar
                                            </button>

                                            {/* Excluir */}
                                            <button
                                                type="button"
                                                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                                                onClick={async () => {
                                                    setOpenRestrMenuId(null);
                                                    const result = await Swal.fire({
                                                        title: 'Excluir versão de restrições?',
                                                        text: `Tem certeza que deseja excluir a versão v${r.version}?`,
                                                        icon: 'warning',
                                                        showCancelButton: true,
                                                        confirmButtonColor: '#d33',
                                                        cancelButtonColor: '#6b7280',
                                                        confirmButtonText: 'Sim, excluir',
                                                        cancelButtonText: 'Cancelar',
                                                    });
                                                    if (result.isConfirmed) {
                                                        // Aqui depois liga com DELETE no backend
                                                        Swal.fire('Excluída!', 'Em breve conectamos com o backend.', 'success');
                                                    }
                                                }}
                                            >
                                                Excluir
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col mt-4">
                                    <h4 className="font-bold text-lg line-clamp-2">
                                        {r.label
                                            ? `${r.label}`
                                            : `${r.project_name || "Projeto sem nome"}`}
                                    </h4>

                                    <div className="mt-3 space-y-1 text-sm">
                                        <div>
                                            <h5 className="font-semibold text-gray-700">Projeto</h5>
                                            <p className="text-gray-700">
                                                {r.project_name || "—"}
                                            </p>
                                        </div>

                                        <div className="mt-2">
                                            <h5 className="font-semibold text-gray-700">Responsável</h5>
                                            <p className="text-gray-700">
                                                {r.created_by_nome || r.created_by_email || "—"}
                                            </p>
                                        </div>

                                        <div className="mt-2">
                                            <h5 className="font-semibold text-gray-700">
                                                Criado em
                                            </h5>
                                            <p className="text-gray-700">
                                                {r.created_at
                                                    ? r.created_at.slice(0, 10).split("-").reverse().join("/")
                                                    : "—"}
                                            </p>
                                        </div>
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
            </div>

        </div>
    );
}

export default Projetos;
