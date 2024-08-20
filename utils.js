function formatDate(date) {
    // Опции для форматирования даты
    const options = { weekday: 'long', day: 'numeric', month: 'long' };

    // Форматируем дату
    const formattedDate = date.toLocaleDateString('ru-RU', options);

    // Извлекаем нужные части и приводим первую букву дня недели к заглавной
    const [weekday, dayMonth] = formattedDate.split(', ');
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

    return `${capitalizedWeekday} (${dayMonth})`;
}


module.exports = { formatDate }