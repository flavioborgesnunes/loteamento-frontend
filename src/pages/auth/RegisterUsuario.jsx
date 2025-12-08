// src/pages/.../RegisterUsuario.jsx
import React, { useEffect, useState } from "react";
import { registerUsuarioInterno } from "../../utils/auth";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth";
import useAxios from "../../utils/useAxios";
import { UserCircle } from "lucide-react";


export default function RegisterUsuario() {
    const navigate = useNavigate();
    const currentUser = useAuthStore((state) => state.allUserData);

    const api = useAxios();

    const [email, setEmail] = useState("");
    const [role, setRole] = useState("comum");
    const [error, setError] = useState(null);

    const [usuarios, setUsuarios] = useState([]);
    const [loadingUsuarios, setLoadingUsuarios] = useState(true);

    // 🔹 Carregar lista de usuários do mesmo dono
    useEffect(() => {
        const carregarUsuarios = async () => {
            try {
                const { data } = await api.get("user/usuarios-do-dono/");
                setUsuarios(data || []);
            } catch (err) {
                console.error("Erro ao carregar usuários do dono:", err);
            } finally {
                setLoadingUsuarios(false);
            }
        };

        carregarUsuarios();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const dono = currentUser?.dono || currentUser?.user_id;

        const { error } = await registerUsuarioInterno(
            email,
            role,
            dono,
            "placeholder2025",
            "placeholder2025"
        );

        if (error) {
            setError(error);
        } else {
            setError(null);
            setEmail("");
            setRole("comum");

            // 🔹 Recarrega lista após criar usuário
            try {
                const { data } = await api.get("user/usuarios-do-dono/");
                setUsuarios(data || []);
            } catch (err) {
                console.error("Erro ao recarregar usuários após cadastro:", err);
            }

            // Se ainda quiser redirecionar para o dashboard, descomenta:
            // navigate('/dashboard');
        }
    };

    const maxPerColumn = 5;
    const coluna1 = usuarios.slice(0, maxPerColumn);
    const coluna2 = usuarios.slice(maxPerColumn, maxPerColumn * 2);


    return (
        <>
            <div className="max-w-md mx-auto mt-8">
                <h2 className="text-2xl font-bold mb-4">Adicionar Usuário</h2>

                {error && (
                    <div className="bg-red-100 text-red-700 p-2 mb-4 rounded text-sm break-words">
                        {JSON.stringify(error)}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow">
                    <input
                        type="email"
                        className="w-full border px-3 py-2 rounded mb-4"
                        placeholder="E-mail do novo usuário"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <select
                        className="w-full border px-3 py-2 rounded mb-4"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        <option value="comum">Usuário Comum</option>
                        <option value="adm">Administrador</option>
                    </select>
                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-4 py-2 rounded w-full"
                    >
                        Cadastrar
                    </button>
                </form>

            </div>

            {/* 🔻 LISTA DE USUÁRIOS DO MESMO DONO ABAIXO DO FORM */}
            <div className="mt-8 bg-white p-4 rounded shadow border-gray-600">
                <h3 className="text-xl font-bold mb-3">Usuários Cadastrados</h3>

                {loadingUsuarios ? (
                    <p className="text-gray-500 text-sm">Carregando usuários...</p>
                ) : usuarios.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                        Nenhum usuário vinculado a este dono.
                    </p>
                ) : (
                    <div className="flex flex-wrap -mx-2">
                        {/* Coluna 1 */}
                        <div className="w-full md:w-1/2 px-2">
                            <ul className="space-y-4">
                                {coluna1.map((u) => (
                                    <li
                                        key={u.id}
                                        className="flex items-center gap-3 p-2 border border-gray-200 rounded"
                                    >
                                        {u.foto ? (
                                            // Se tiver foto → exibe
                                            <img
                                                src={u.foto}
                                                alt={u.nome || u.email}
                                                className="w-12 h-12 rounded-full object-cover bg-gray-100"
                                            />
                                        ) : (
                                            // Se NÃO tiver → usa ícone do Lucide
                                            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 text-gray-500">
                                                <UserCircle size={32} strokeWidth={1.5} />
                                            </div>
                                        )}

                                        <div className="flex flex-col">
                                            <span className="font-semibold">
                                                {u.nome
                                                    ? `${u.nome} ${u.sobrenome || ""}`.trim()
                                                    : "(Sem nome cadastrado)"}
                                            </span>
                                            <span className="text-gray-700 text-sm">
                                                {u.email}
                                            </span>
                                            <span className="mt-1 inline-flex text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 w-fit">
                                                {u.role}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Coluna 2 */}
                        <div className="w-full md:w-1/2 px-2">
                            <ul className="space-y-4">
                                {coluna2.map((u) => (
                                    <li
                                        key={u.id}
                                        className="flex items-center gap-3 p-2 border border-gray-200 rounded"
                                    >
                                        <img
                                            src={u.foto || "/default-avatar.png"}
                                            alt={u.nome || u.email}
                                            className="w-12 h-12 rounded-full object-cover bg-gray-100"
                                        />

                                        <div className="flex flex-col">
                                            <span className="font-semibold">
                                                {u.nome
                                                    ? `${u.nome} ${u.sobrenome || ""}`.trim()
                                                    : "(Sem nome cadastrado)"}
                                            </span>
                                            <span className="text-gray-700 text-sm">
                                                {u.email}
                                            </span>
                                            <span className="mt-1 inline-flex text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 w-fit">
                                                {u.role}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

            </div>
        </>
    );
}
