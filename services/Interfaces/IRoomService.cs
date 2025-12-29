namespace ChatServerMVC.services.Interfaces
{
    public interface IRoomService
    {
        Task<Guid> CreateRoom(string name, Guid creator, List<Guid> users, List<(Guid, byte[])> encryptionKeys);
        Task<Guid> CreateDM(Guid firstUser, Guid secondUser, List<(Guid, byte[])> encryptionKeys);
        Task<List<Guid>> GetRooms(Guid User);
    }
}
