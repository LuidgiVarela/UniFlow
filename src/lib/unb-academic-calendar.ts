export const UNB_2026_2_CALENDAR_SOURCE =
  "https://saa.unb.br/wp-content/uploads/2026/06/2026_2_Calend_Ativ_Grad_15_06_2026.pdf";

export type UnbAcademicCalendarEvent = {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  label: string;
  color: string;
};

export const unbAcademicEvents2026_2: UnbAcademicCalendarEvent[] = [
  {
    id: "unb-2026-2-rematricula",
    date: "2026-08-03",
    endDate: "2026-08-04",
    title: "Período de rematrícula",
    label: "Matrícula",
    color: "#6aa6ff",
  },
  {
    id: "unb-2026-2-registro-extraordinario",
    date: "2026-08-07",
    endDate: "2026-08-14",
    title: "Matrícula extraordinária",
    label: "Matrícula",
    color: "#6aa6ff",
  },
  {
    id: "unb-2026-2-inicio-aulas",
    date: "2026-08-10",
    title: "Início das aulas de 2026.2",
    label: "Período letivo",
    color: "#69d8b2",
  },
  {
    id: "unb-2026-2-independencia",
    date: "2026-09-07",
    title: "Independência do Brasil",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-25-por-cento",
    date: "2026-09-09",
    title: "25% do período de aulas",
    label: "Marco acadêmico",
    color: "#a78bfa",
  },
  {
    id: "unb-2026-2-semana-universitaria",
    date: "2026-09-20",
    endDate: "2026-09-25",
    title: "Semana Universitária",
    label: "Evento institucional",
    color: "#c77dff",
  },
  {
    id: "unb-2026-2-trancamento-parcial",
    date: "2026-10-09",
    title: "Prazo final para trancamento parcial de disciplinas",
    label: "50% do período de aulas",
    color: "#f5be5c",
  },
  {
    id: "unb-2026-2-aparecida",
    date: "2026-10-12",
    title: "Nossa Senhora Aparecida",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-servidor-publico",
    date: "2026-10-28",
    title: "Dia do Servidor Público",
    label: "Ponto facultativo",
    color: "#7dd3fc",
  },
  {
    id: "unb-2026-2-finados",
    date: "2026-11-02",
    title: "Finados",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-trancamento-geral",
    date: "2026-11-12",
    title: "Prazo final para trancamento geral de matrícula",
    label: "75% do período de aulas",
    color: "#f5be5c",
  },
  {
    id: "unb-2026-2-proclamacao-republica",
    date: "2026-11-15",
    title: "Proclamação da República",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-consciencia-negra",
    date: "2026-11-20",
    title: "Dia de Zumbi e da Consciência Negra",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-fim-aulas",
    date: "2026-12-14",
    title: "Término do período de aulas",
    label: "Período letivo",
    color: "#69d8b2",
  },
  {
    id: "unb-2026-2-notas-finais",
    date: "2026-12-19",
    title: "Prazo final para lançamento de menções",
    label: "Prazo acadêmico",
    color: "#f5be5c",
  },
  {
    id: "unb-2026-2-vespera-natal",
    date: "2026-12-24",
    title: "Véspera de Natal após as 13h",
    label: "Ponto facultativo",
    color: "#7dd3fc",
  },
  {
    id: "unb-2026-2-natal",
    date: "2026-12-25",
    title: "Natal",
    label: "Feriado nacional",
    color: "#57d66d",
  },
  {
    id: "unb-2026-2-vespera-ano-novo",
    date: "2026-12-31",
    title: "Véspera de Ano Novo após as 13h",
    label: "Ponto facultativo",
    color: "#7dd3fc",
  },
];
