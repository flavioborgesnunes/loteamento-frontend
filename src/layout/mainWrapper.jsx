import { useEffect, useState } from 'react';
import { setUser } from '../utils/auth';
import useAxios from '../utils/useAxios';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import bgBase from '../pages/base/bg-base.png';
import { Settings, FileUp, Home, LayoutDashboard, MonitorDown } from 'lucide-react';
import ItemMenu from '../pages/base/ItemMenu';
import logo from '../pages/auth/images/logoctz.png';

const MainWrapper = () => {
    const [loading, setLoading] = useState(true);
    const user = useAuthStore(state => state.allUserData);
    const perfilUser = useAuthStore(state => state.perfilUser);
    const setPerfilUser = useAuthStore(state => state.setPerfilUser);
    const axiosAuth = useAxios();

    useEffect(() => {
        const handler = async () => {
            try {
                setLoading(true);
                await setUser();

                if (user) {
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
    }, [user]); // Dependência para sempre atualizar quando user mudar (ex: login)

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
                            <ItemMenu icon={FileUp} text="Novo Estudo com AI" to="/estudo" />
                            <ItemMenu icon={MonitorDown} text="Projetos" to="/projetos" />
                            <ItemMenu icon={Home} text="Dashboard" to="#" />
                            <ItemMenu icon={Home} text="Dashboard" to="#" />
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
                    <div className="relative pr-5">
                        <Outlet />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MainWrapper;
