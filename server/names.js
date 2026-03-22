const adjectives = [
    'Ambitious', 'Brave', 'Calm', 'Delightful', 'Eager', 'Faithful', 'Glorious', 'Happy', 'Intelligent', 'Jolly',
    'Kind', 'Lively', 'Magnificent', 'Nice', 'Obedient', 'Polite', 'Quiet', 'Radiant', 'Silly', 'Thoughtful',
    'Unique', 'Victorious', 'Witty', 'Xenon', 'Youthful', 'Zealous', 'Azure', 'Crimson', 'Golden', 'Silver'
];

const animals = [
    'Antelope', 'Bear', 'Cat', 'Dolphin', 'Eagle', 'Falcon', 'Giraffe', 'Hamster', 'Iguana', 'Jaguar',
    'Koala', 'Lion', 'Monkey', 'Nightingale', 'Owl', 'Panda', 'Quail', 'Rabbit', 'Snake', 'Tiger',
    'Unicorn', 'Vulture', 'Wolf', 'Xerus', 'Yak', 'Zebra', 'Otter', 'Penguin', 'Fox', 'Elephant'
];

function generateName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adj} ${animal}`;
}

module.exports = { generateName };
