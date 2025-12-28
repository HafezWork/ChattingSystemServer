using System;
using System.Collections.Generic;

namespace ChatServerMVC.Domain.Entities
{
    public class Room
    {
        public Guid RoomId { get; set; } = Guid.NewGuid();
        public string Name { get; set; }
        public bool IsDM { get; set; } = false;
        public List<Guid> Participants { get; set; } = new List<Guid>();

        // Stores shared keys encrypted for each participant
        public Dictionary<Guid, byte[]> EncryptedKeys { get; set; } = new();

        // Dummy constructor for group
        public Room(string name, List<Guid> participants)
        {
            Name = name;
            Participants = participants;
        }

        // Dummy constructor for DM
        public Room(Guid user1, Guid user2)
        {
            IsDM = true;
            Participants.Add(user1);
            Participants.Add(user2);
        }
    }
}
