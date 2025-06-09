import React, { useState } from 'react';
import { registerUsuarioInterno } from '../../utils/auth';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';

export default function RegisterUsuario() {
    const navigate = useNavigate();
    const currentUser = useAuthStore(state => state.allUserData);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('comum');
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const dono = currentUser?.dono || currentUser?.user_id;

        const { error } = await registerUsuarioInterno(email, role, dono, 'placeholder2025', 'placeholder2025');

        if (error) {
            setError(error);
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <div className="max-w-md mx-auto mt-8">
            <h2 className="text-2xl font-bold mb-4">Adicionar Usuário</h2>

            {error && <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{JSON.stringify(error)}</div>}

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
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded w-full">
                    Cadastrar
                </button>
            </form>
        </div>
    );
}
