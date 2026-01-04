using ChatServerMVC.Models;
using ChatServerMVC.services.DTOs.Room;

namespace ChatServerMVC.services.Interfaces
{
    public interface IRoomService
    {
        Task<Guid> CreateRoom(string name, Guid creator, List<Guid> users, List<(Guid, byte[])> encryptionKeys);
        Task<Guid> CreateDM(Guid firstUser, string secondUser, List<(Guid, byte[])> encryptionKeys);
        Task<List<GetRoomsResponse>> GetRooms(Guid User);
        Task<List<Guid>> GetRoomMembers(Guid RoomId);
        Task<RoomModel> GetRoomById(Guid RoomId, Guid UserId);
    }
}
