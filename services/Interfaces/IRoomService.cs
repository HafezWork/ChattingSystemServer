namespace ChatServerMVC.services.Interfaces
{
    public interface IRoomService
    {
        Task<Guid> CreateRoom(string name, Guid creator, List<Guid> users, List<byte[]> encryptionKeys);
        Task<Guid> CreateDM(Guid firstUser, Guid secondUser, List<byte[]> encryptionKeys);
        Task<Guid> GetRooms(Guid User);
    }
}
