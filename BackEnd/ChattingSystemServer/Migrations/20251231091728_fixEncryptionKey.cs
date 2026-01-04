using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatServerMVC.Migrations
{
    /// <inheritdoc />
    public partial class fixEncryptionKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "Id",
                table: "EncryptionKeys",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                collation: "ascii_general_ci");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Id",
                table: "EncryptionKeys");
        }
    }
}
