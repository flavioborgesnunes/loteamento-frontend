import { useEffect, useState } from 'react';
import { setUser } from '../utils/auth';
import useAxios from '../utils/useAxios';
import { Navigate, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { logout } from '../utils/auth'
import bgBase from '../components/base/bg-base.png';
import { Bell, User, CircleUserRound, Settings, FileUp, Brain, Home, LayoutDashboard, MonitorDown, ChevronDown, LogOut, UserRoundPlus, Eye, MapPlus } from 'lucide-react';
import ItemMenu from '../components/base/ItemMenu';
import logo from '../pages/auth/images/logoctz.png';


const MainWrapper = () => {
    const [loading, setLoading] = useState(true);
    const user = useAuthStore(state => state.allUserData);
    const perfilUser = useAuthStore(state => state.perfilUser);
    const setPerfilUser = useAuthStore(state => state.setPerfilUser);
    const nome = perfilUser?.nome || 'Usuário';
    const sobrenome = perfilUser?.sobrenome || '';
    const [open, setOpen] = useState(false);
    const axiosAuth = useAxios();
    const navigate = useNavigate();

    const displayName =
        perfilUser?.nome
            ? `${nome} ${sobrenome}`
            : (perfilUser?.email || user?.email || 'Usuário');

    useEffect(() => {
        const handler = async () => {
            try {
                await setUser(); // garante que allUserData será atualizado
                const updatedUser = useAuthStore.getState().allUserData;
                if (updatedUser && !perfilUser) {
                    const { data } = await axiosAuth.get('user/');
                    setPerfilUser(data);
                }
            } catch (error) {
                console.error("Erro ao configurar usuário:", error);
            } finally {
                setLoading(false);
            }
        };

        handler();
    }, []); // vazio para rodar uma vez só

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    if (loading) return <div>Carregando...</div>;
    if (!user) return <Navigate to="/login" replace />;

    return (
        <div className="relative">
            {/* Imagem de fundo cobrindo toda a tela no topo */}
            <div
                className="absolute top-0 left-0 w-full h-56 bg-cover bg-center z-0"
                style={{ backgroundImage: `url(${bgBase})` }}
            />

            {/* Layout principal com sidebar e conteúdo */}
            <div className="relative flex z-10">
                {/* Sidebar fixa */}
                <aside className="fixed top-0 left-0 w-80 h-screen bg-transparent z-50 pt-6 pl-4">
                    <div
                        className="
                            bg-white w-full h-[98%] max-h-screen flex flex-col items-center justify-between rounded-2xl shadow-xl px-5
                            overflow-y-auto scrollbar-hide
                        "
                    >
                        <div className='w-full flex flex-col'>
                            <img src={logo} className='pt-15 pb-8 mb-5 w-50 border-b-2 border-b-gray-200' />
                            <ItemMenu icon={LayoutDashboard} text="Dashboard" to="/dashboard" />
                            <ItemMenu icon={FileUp} text="Novo Estudo" to="/estudo" />
                            <ItemMenu icon={MonitorDown} text="Projetos" to="/projetos" />
                            <ItemMenu icon={MapPlus} text="Restrições" to="/loteador" />
                            <ItemMenu icon={Eye} text="Visualizar" to="/visualizar-projetos" />
                            <ItemMenu icon={Eye} text="Parcelamento" to="/parcelamento" />
                            <ItemMenu icon={Eye} text="Parcelamento com I.A." to="/ia-parcelamento" />
                            {/* <ItemMenu icon={Eye} text="Teste" to="/parcelamento/gerar-quarteirao" /> */}
                            {/* <ItemMenu icon={Brain} text="Estudo com AI" to="/ia" /> */}
                            {(user.role === 'dono' || user.role === 'adm') && (

                                <ItemMenu icon={UserRoundPlus} text="Cadastra Usuário" to="/register-usuario" />

                            )}
                        </div>

                        {/* Exibir nome + foto do usuário na parte inferior da Sidebar */}
                        <div className="flex flex-col items-center mb-4 mt-auto">
                            {perfilUser?.foto && (
                                <img
                                    src={perfilUser.foto}
                                    alt="Foto do usuário"
                                    className="w-12 h-12 object-cover rounded-full border mb-2"
                                />
                            )}
                            <p className="text-sm font-medium">
                                {perfilUser?.nome} {perfilUser?.sobrenome}
                            </p>
                            <p className="text-xs text-gray-500">{perfilUser?.email}</p>
                        </div>

                        <ItemMenu icon={Settings} text="Settings" to="/settings" className="mt-auto " />
                    </div>
                </aside>

                {/* Espaço vazio para empurrar conteúdo */}
                <div className="w-80 shrink-0 ml-5" />

                {/* Conteúdo principal */}
                <div className="flex-1 min-h-screen relative">
                    {/* Conteúdo sobreposto ou abaixo da imagem */}

                    <div className='flex mt-10 justify-between items-center px-5 text-white'>
                        <h1 className="text-xl">Dashboard</h1>
                        <div className='flex gap-5 mr-5 font-bold items-center'>
                            <User className='mr-1' />
                            <p className='pr-5 border-r-1' >Fale com um especialista</p>
                            <input type="text" className='bg-white rounded-md pl-3 py-1 font-extralight text-sm' placeholder='Pesquisar' />
                            <Bell />
                            <Settings />
                            {perfilUser?.foto ? (
                                <img src={perfilUser?.foto} className='rounded-full w-10 h-10' />
                            ) : <CircleUserRound />}
                            <div className="relative inline-block text-left">
                                <button
                                    onClick={() => setOpen(!open)}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-white bg-transparent hover:scale-105"
                                >
                                    <span>{displayName}</span>

                                    <ChevronDown className="w-4 h-4" />
                                </button>

                                {open && (
                                    <div className="absolute right-0 z-10 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg">
                                        <div className="py-1 text-sm text-gray-700">
                                            <Link
                                                to="/settings"
                                                className="flex items-center px-4 py-2 hover:bg-gray-100 gap-2"
                                                onClick={() => setOpen(false)}
                                            >
                                                <Settings className="w-4 h-4" />
                                                Editar perfil
                                            </Link>
                                            <button
                                                onClick={() => {
                                                    handleLogout();
                                                    setOpen(false);
                                                }}
                                                className="flex items-center w-full px-4 py-2 hover:bg-gray-100 gap-2 text-left"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                Logout
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>

                    <div className="relative pr-5">
                        <Outlet />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MainWrapper;
