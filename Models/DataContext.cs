using System.Security.Policy;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.Models
{
    public class DataContext : DbContext
    {
        public DataContext(DbContextOptions<DataContext> options)
        : base(options)
        {
        }
        public DbSet<UserModel> Users { get; set; }
        public DbSet<MessageModel> Messages { get; set; }
        public DbSet<RoomModel> Rooms { get; set; }
        public DbSet<RoomMemberModel> RoomMembers { get; set; }
        public DbSet<EncryptionKeyModel> EncryptionKeys { get; set; }

        //protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        //{
        //    optionsBuilder..
        //}
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<UserModel>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.UserName).IsRequired();
                entity.HasIndex(e => e.UserName).IsUnique();
                entity.Property(e => e.PublicKey).IsRequired();
            });

            modelBuilder.Entity<MessageModel>(entity =>
            {
                entity.HasKey(e => e.MessageId);
                entity.HasIndex(e => new { e.RoomId, e.CreatedAt });
                entity.HasOne(e => e.To).WithMany(r => r.Messages).HasForeignKey(e => e.RoomId);
                entity.HasOne(e => e.User).WithMany().HasForeignKey(e => e.From);
                entity.Property(e => e.CipherText).IsRequired();
                entity.Property(e => e.Nonce).IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnType("datetime").HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            modelBuilder.Entity<RoomModel>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnType("datetime").HasDefaultValueSql("CURRENT_TIMESTAMP");

            });

            modelBuilder.Entity<RoomMemberModel>()
                .HasOne(rm => rm.User)
                .WithMany(u => u.RoomMembers) 
                .HasForeignKey(rm => rm.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            
            modelBuilder.Entity<RoomMemberModel>()
                .HasOne(rm => rm.Room)
                .WithMany(r => r.Users)
                .HasForeignKey(rm => rm.RoomId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<EncryptionKeyModel>(entity => 
            {
                entity.HasKey(e => new { e.RoomId, e.UserId, e.KeyVersion });
                entity.HasOne(e => e.Room).WithMany(e => e.Keys).HasForeignKey(e => e.RoomId);
                entity.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId);
                entity.Property(e => e.Key).IsRequired();
                entity.Property(e => e.CreatedAt).HasColumnType("datetime").HasDefaultValueSql("CURRENT_TIMESTAMP");
            });
        }
    }
}
